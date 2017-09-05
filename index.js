const fs           = require( 'fs' )
const { resolve }  = require( 'path' )
const EventEmitter = require( 'events' )
const got          = require( 'got' )

const reVersion = /\d+\.\d+\.\d+/

function parseJSON( pkg, opts ) {
    let pkgs  = {}
    let count = 0

    function iterateDep( propKey ) {
        let obj = pkg[ propKey ]

        for ( let key in obj ) {
            let value = obj[ key ]
            let match = value.match( reVersion )

            count++

            pkgs[ key ] = {
                lineNo : -1,
                name   : key,
                key    : propKey,
                version: match ? match[ 0 ] : value,
                range  : isNaN( parseInt( value ) ) ? value[ 0 ] : ''
            }
        }
    }

    if ( opts.all ) {
        iterateDep( 'devDependencies' )
        iterateDep( 'dependencies' )
    } else {
        if ( opts.prod ) {
            iterateDep( 'dependencies' )
        }

        if ( opts.dev ) {
            iterateDep( 'devDependencies' )
        }
    }

    return {
        pkgs,
        count,
        source: pkg
    }
}

function parseText( content, opts ) {
    let fileLines = content.split( '\n' )
    let pkgs      = {}
    let count     = 0
    let isBegin   = false

    fileLines.forEach( ( line, index ) => {
        line = line.trim()

        if ( !opts.all ) {
            if ( line.startsWith( '"dependencies"' ) && !opts.dev ) {
                return isBegin = true
            }

            if ( line.startsWith( '"devDependencies"' ) && !opts.prod ) {
                return isBegin = true
            }
        }

        if ( isBegin ) {
            if ( line.startsWith( '}' ) ) {
                isBegin = false
            } else if ( line.startsWith( '"' ) ) {
                let npmInfos = line.replace( /"/g, '' ).split( ':' ),
                    name     = npmInfos[ 0 ],
                    part2    = npmInfos[ 1 ].trim(),
                    version  = part2.match( reVersion )[ 0 ],
                    range    = isNaN( parseInt( part2[ 0 ] ) ) ? part2[ 0 ] : ''

                count++
                pkgs[ name ] = {
                    lineNo: index,
                    name,
                    version,
                    range
                }
            }
        }
    } )

    return {
        pkgs,
        count,
        source: fileLines
    }
}

class Updater extends EventEmitter {
    constructor( opts = {} ) {
        super()

        opts.prod    = !!opts.prod
        opts.dev     = !!opts.dev
        opts.all     = opts.prod === opts.dev
        this.opts    = opts
        this.pkgPath = resolve( __dirname, opts.path || './package.json' )
    }

    update() {
        return new Promise( ( resolve, reject ) => {
                let fileContent
                let requests = []
                let opts     = this.opts

                try {
                    fileContent = fs.readFileSync( this.pkgPath, {
                        encoding: 'utf8'
                    } )
                } catch ( e ) {
                    this.emit( 'end' )
                    reject( `${ this.pkgPath } is not correct.` )
                }

                let dependenciesData = {}
                let isJSONFile       = true

                try {
                    dependenciesData = parseJSON( JSON.parse( fileContent ), opts )
                } catch ( e ) {
                    isJSONFile       = false
                    dependenciesData = parseText( fileContent, opts )
                }

                this.emit( 'begin', {
                    file : this.pkgPath,
                    count: dependenciesData.count
                } )

                let index = 0
                for ( let key in  dependenciesData.pkgs ) {
                    let { name } = dependenciesData.pkgs[ key ]

                    requests.push( new Promise( ( resolve, reject ) => {
                        setTimeout( () => {
                            got( `https://registry.npm.taobao.org/${ name }/latest` )
                                .then( ( res ) => {
                                    let data = JSON.parse( res.body )

                                    this.emit( 'progress', data.name )

                                    resolve( {
                                        name   : data.name,
                                        version: data[ 'dist-tags' ].latest
                                    } )
                                } )
                                .catch( () => {
                                    this.emit( 'failed', name )
                                    reject()
                                } )
                        }, index++ * 100 )
                    } ) )
                }

                let updated = []
                Promise.all( requests )
                    .then( ( datas ) => {
                        datas.forEach( ( { name, version } ) => {
                            let pkg         = dependenciesData.pkgs[ name ]
                            let prevVersion = pkg.version
                            let lineNo      = pkg.lineNo

                            //TODO: check version range
                            if ( prevVersion !== version ) {
                                if ( isJSONFile ) {
                                    let updateObj

                                    if ( opts.all ) {
                                        updateObj = dependenciesData.source[ pkg.key ]
                                    } else if ( opts.prod ) {
                                        updateObj = dependenciesData.source[ 'dependencies' ]
                                    } else {
                                        updateObj = dependenciesData.source[ 'devDependencies' ]
                                    }

                                    updateObj[ name ] = pkg.range + version
                                } else {
                                    dependenciesData.source[ lineNo ] = dependenciesData.source[ lineNo ].replace( prevVersion, version )
                                }

                                updated.push( {
                                    name  : name,
                                    cur   : prevVersion,
                                    newest: version
                                } )
                            }
                        } )
                    } )
                    .then( () => {
                        //Save
                        fs.writeFileSync( this.pkgPath,
                            isJSONFile ? JSON.stringify( dependenciesData.source, null, 4 ) : dependenciesData.source.join( '\n' )
                        )
                        this.emit( 'end' )
                    } )
            }
        )
    }
}

module.exports = Updater