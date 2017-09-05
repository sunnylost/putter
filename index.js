let fs        = require( 'fs' ),
    got       = require( 'got' ),
    logUpdate = require( 'log-update' )

const reVersion = /\d+\.\d+\.\d+/,
      filename  = './package.json'

let file               = fs.readFileSync( filename, {
        encoding: 'utf8'
    } ),
    globalUpdatingName = '',
    globalProgress     = 0

let requests         = [],
    dependenciesData = {},
    fileContents     = file.split( '\n' ),
    isBegin          = false

fileContents.forEach( ( line, index ) => {
    line = line.trim()

    if ( line.startsWith( '"dependencies"' ) || line.startsWith( '"devDependencies"' ) ) {
        return isBegin = true
    }

    if ( isBegin ) {
        if ( line.startsWith( '}' ) ) {
            isBegin = false
        } else if ( line.startsWith( '"' ) ) {
            let npmInfos       = line.replace( /"/g, '' ).split( ':' ),
                name           = npmInfos[ 0 ],
                part2          = npmInfos[ 1 ].trim(),
                version        = part2.match( reVersion )[ 0 ],
                rangeIndicator = isNaN( parseInt( part2[ 0 ] ) ) ? part2[ 0 ] : ''

            dependenciesData[ name ] = {
                index,
                version,
                rangeIndicator
            }

            requests.push( new Promise( ( resolve, reject ) => {
                setTimeout( () => {
                    got( `https://registry.npm.taobao.org/${ name }/latest` )
                        .then( ( res ) => {
                            let data = JSON.parse( res.body )

                            globalUpdatingName = data.name
                            globalProgress++

                            resolve( {
                                name   : data.name,
                                version: data[ 'dist-tags' ].latest
                            } )
                        } )
                        .catch( ( err ) => {
                            console.log( 'package: ' + name + ' update error. \n', err )
                            reject()
                        } )
                }, index * 100 )
            } ) )
        }
    }
} )

let timeoutId = setInterval( () => {
    if ( !globalUpdatingName ) {
        return
    }

    logUpdate( 'finish ' + parseInt( 100 * globalProgress / requests.length ) + '%, current: ' + globalUpdatingName )
}, 100 )

logUpdate( 'prepare for update...' )

Promise.all( requests )
    .then( ( datas ) => {
        datas.forEach( ( data ) => {
            let pkg = dependenciesData[ data.name ]

            if ( pkg.version !== data.version ) {
                fileContents[ pkg.index ] = fileContents[ pkg.index ].replace( pkg.version, data.version )
            }
        } )
    } )
    .then( () => {
        clearTimeout( timeoutId )
        fs.writeFileSync( filename, fileContents.join( '\n' ) )
        logUpdate( 'package.json updated successfully.' )
    } )
