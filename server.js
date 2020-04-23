const fs = require('fs')
const jsonxml = require('jsontoxml');
const escape = require('escape-html');
const express = require('express')
const { createClient } = require('lightrpc');
const app = express()
const port = process.env.PORT || 3000
const rootDomain = 'https://d.tube'

const lightrpc = createClient('https://api.steemit.com', {
    timeout: 5000
});
const lightrpchive = createClient('https://anyx.io', {
    timeout: 5000
});
const javalon = require('javalon')

let layouts = {}

app.get('*', function(req, res, next) {
    // parsing the query
    var reqPath = req.path

    if (reqPath.startsWith('/oembed')) {
        console.log(req.headers['user-agent'], req.query)
        if (req.query.url && req.query.url.indexOf('/?_escaped_fragment_=') > -1)
            req.query.url = req.query.url.replace('/?_escaped_fragment_=', '')
        if (req.query.url && isValidDTubeUrl(req.query.url) ) {
            getVideo(
            req.query.url.split('/')[4],
            req.query.url.split('/')[5],
            function(err, html, pageTitle, description, url, snap, duration, snapHeight) {
                if (err) {
                    if (err == 'Internal Error')
                        res.sendStatus(503)
                    else if (err.message.toString().startsWith('Request has timed out.'))
                        res.sendStatus(503)
                    else
                        res.sendStatus(404)
                    return;
                }

                var sizes = {
                    width: 480,
                    height: 270
                }
                if (req.query.maxwidth && req.query.maxheight) {
                    var userWidth = parseInt(req.query.maxwidth)
                    var userHeight = parseInt(req.query.maxheight)
                    if (convert169(userWidth) > userHeight) {
                        sizes.height = userHeight
                        sizes.width = convert169(sizes.height, false)
                    } else if (userWidth < convert169(userHeight, false)) {
                        sizes.width = userWidth
                        sizes.height = convert169(userWidth)
                    }
                }
                if (req.query.maxwidth && !req.query.maxheight) {
                    var userWidth = parseInt(req.query.maxwidth)
                    sizes.width = userWidth
                    sizes.height = convert169(userWidth)
                }
                if (!req.query.maxwidth && req.query.maxheight) {
                    var userHeight = parseInt(req.query.maxheight)
                    sizes.height = userHeight
                    sizes.width = convert169(sizes.height, false)
                }
                if (sizes.width<=200) {
                    sizes.width = 200
                    sizes.height = 113
                }

                var response = {
                    type: 'video',
                    version: '1.0',
                    provider_name: 'DTube',
                    provider_url: rootDomain,
                    title: pageTitle,
                    author_name: req.query.url.split('/')[4],
                    author_url: 'https://d.tube/#!/c/'+req.query.url.split('/')[4],
                    html: html,
                    width: sizes.width,
                    height: sizes.height,
                    duration: Math.round(duration),
                    description: description,
                    thumbnail_url: snap,
                    thumbnail_width: 210,
                    thumbnail_height: 118
                }
                if (snapHeight == 360) {
                    response.thumbnail_height = 360
                    response.thumbnail_width = 640
                }
                if (req.query.format == 'xml') {
                    res.set('Content-Type', 'text/xml');
                    response.html = escape(response.html)
                    var xml = jsonxml(response)
                    xml += '</oembed>'
                    xml = '<oembed>' + xml
                    xml = '<?xml version="1.0" encoding="utf-8"?>\n' + xml
                    res.send(xml)
                }
                else
                    res.send(response)
            })
        } else {
            res.sendStatus(404);
        }
        
    } else {
        res.sendStatus(404);
    }
    
})

app.listen(port, () => console.log('oembed listening on port '+port))

function convert169(width, isWidth = true) {
    if (isWidth)
        return Math.round(width*9/16)
    
    return Math.round(width*16/9)
}

function isValidDTubeUrl(url) {
    var args = url.split('/')
    if (args[2] != 'd.tube')
        return false
    if (args[3] != 'v')
        return false
    if (!args[4] || !args[5])
        return false
    return true
}

function error(err, next) {
    if (err) {
        console.log(err)
        next()
        return true
    }
    return false
}

function handleChainData(author, permlink, video, cb) {
    var html = '<iframe width="480" height="270" src="https://emb.d.tube/#!/'+author+'/'+permlink+'" frameborder="0" allowfullscreen></iframe>'
    var url = rootDomain+'/#!/v/'+author+'/'+permlink
    var snap = null
    var snapHeight = 118
    if (video.info && video.info.snaphash)
        snap = 'https://snap1.d.tube/ipfs/'+video.info.snaphash
    if (video.json.ipfs && video.json.ipfs.snaphash)
        snap = 'https://snap1.d.tube/ipfs/'+video.json.ipfs.snaphash
    if (video.json.thumbnailUrl)
        snap = video.json.thumbnailUrl
    if (!snap && video.json.files) {
        for (const key in video.json.files) {
            if (video.json.files[key].img && video.json.files[key].img["118"])
                snap = 'https://snap1.d.tube/ipfs/'+video.json.files[key].img["118"]
            if (video.json.files[key].img && video.json.files[key].img["360"]) {
                snap = 'https://snap1.d.tube/ipfs/'+video.json.files[key].img["360"]
                snapHeight = 360
            }
        }
    }
    if (!snap && video.json.files && video.json.files.youtube) {
        snap = 'https://i.ytimg.com/vi/'+video.json.files.youtube+'/hqdefault.jpg'
        snapHeight = 360
    }
    var duration = video.json.duration || null
    if (video.json.dur) duration = video.json.dur
    var description = video.json.desc
    if (!description && video.json.description) description = video.json.description
    if (description) description = description.replace(/(?:\r\n|\r|\n)/g, ' ').substr(0, 300)
    if (!description) description = ''
    if (cb) {
        cb(null, html, video.json.title, description, url, snap, duration, snapHeight)
        cb = null
    }
}

function getVideo(author, permlink, cb) {
    javalon.getContent(author, permlink, function(err, video) {
        if (err) {
            lightrpc.send('get_state', [`/dtube/@${author}/${permlink}`], function(err, result) {
                if (err || !result.content[author+'/'+permlink]) {
                    lightrpchive.send('get_state', [`/dtube/@${author}/${permlink}`], function(err, result) {
                        if (err) {
                            cb('Internal Error')
                            return
                        }
                        if (!result.content[author+'/'+permlink]) {
                            cb('Not found')
                            return
                        }
                        var video = parseVideo(result.content[author+'/'+permlink])
                        handleChainData(author, permlink, video, cb)
                        hasReplied = true
                    })
                    return
                }
                var video = parseVideo(result.content[author+'/'+permlink])
                handleChainData(author, permlink, video, cb)
                hasReplied = true
            })
            return
        }
        handleChainData(author, permlink, video, cb)
        hasReplied = true
    })

}

function parseVideo(video, isComment) {
    try {
        if (video && video.json_metadata)
            var newVideo = {}
            newVideo.json = JSON.parse(video.json_metadata).video
    } catch(e) {
        console.log(e)
    }
    if (!newVideo) newVideo = {}
    // newVideo.active_votes = video.active_votes
    newVideo.author = video.author
    // newVideo.body = video.body
    // newVideo.total_payout_value = video.total_payout_value
    // newVideo.curator_payout_value = video.curator_payout_value
    // newVideo.pending_payout_value = video.pending_payout_value
    newVideo.permlink = video.permlink
    newVideo.created = video.created
    // newVideo.net_rshares = video.net_rshares
    // newVideo.reblogged_by = video.reblogged_by
    return newVideo;
}

function getRobotName(userAgent) {
    for (let i = 0; i < crawlers.length; i++) {
        var re = new RegExp(crawlers[i].pattern);
        var isRobot = re.test(userAgent)
        if (isRobot) return crawlers[i].pattern;
    }
    return;
}
