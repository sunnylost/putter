#! /usr/bin/env node
const Updater   = require( '../' )
const logUpdate = require( 'log-update' )
const validOpts = {
    d: {
        opt : 'dev',
        desc: 'only update devDependencies'
    },
    p: {
        opt : 'prod',
        desc: 'only update dependencies'
    },
    o: {
        opt : 'output',
        desc: 'not modify package.json, only display update packages.'
    }
}


function run() {
    const updater = new Updater( getOpt() )
    let loadedNum = 0
    let totalNum  = 0
    let timeoutId
    let currentLoadingName

    updater.on( 'begin', ( { file, count } ) => {
        logUpdate( `prepare to update package file: ${ file } ...` )
        totalNum = count

        timeoutId = setInterval( () => {
            if ( !currentLoadingName ) {
                return
            }

            logUpdate( 'finish ' + parseInt( 100 * loadedNum++ / totalNum ) + '%, current: ' + currentLoadingName )
        }, 100 )
    } )

    updater.on( 'progress', ( name ) => {
        currentLoadingName = name
    } )

    updater.on( 'end', ( result ) => {
        clearTimeout( timeoutId )

        if ( !result ) {
            logUpdate( 'package.json updated failed.' )
        } else {
            logUpdate( 'package.json updated successfully.' )
        }
    } )

//updater.update()
}

function getOpt() {
    let argv = process.argv.slice( 2 )
    let opt  = {}
    console.log( argv )

    argv.forEach( ( arg ) => {
        if ( arg[ 0 ] === '-' ) {
            let opt = arg[ 1 ] && arg[ 1 ].toLowerCase()

            if ( typeof  validOpts[ opt ] === 'object' ) {
                opt[ validOpts[ opt ].opt ] = true
            } else {
                console.error( `${arg[ 1 ]} is not a valid options.` )
            }
        }
    } )
    return opt
}

let args = process.argv.slice( 2 )

if ( args.length ) {
    let opt = args[ 0 ].toLowerCase()

    if ( opt === '-h' ) {
        console.log( 'valid options:' )
        for ( let key in validOpts ) {
            console.log( '-' + key + ':', validOpts[ key ].desc )
        }
        return
    } else if ( opt === '-v' ) {
        return console.log( require( '../package.json' ).version )
    }
}

run()
