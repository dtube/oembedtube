const fs = require('fs')
const express = require('express')
const { createClient } = require('lightrpc');
const app = express()
const port = process.env.PORT || 3000
const rootDomain = 'https://d.tube'

const lightrpc = createClient('https://api.steemit.com', {
    timeout: 5000
});

let layouts = {}

app.get('*', function(req, res, next) {
    // parsing the query
    var reqPath = req.path

    if (reqPath.startsWith('/oembed')) {
        console.log(req.query)
        if (req.query.url && isValidDTubeUrl(req.query.url) ) {
            getVideo(
            req.query.url.split('/')[4],
            req.query.url.split('/')[5],
            function(err, html, pageTitle, description, url, snap, urlvideo, duration) {
                if (err) {
                    if (err.message.toString().startsWith('Request has timed out.'))
                        res.sendStatus(503)
                    else
                        res.sendStatus(404)
                    return;
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
                    width: 480,
                    height: 270,
                    duration: Math.round(duration),
                    description: description,
                    thumbnail_url: snap,
                    thumbnail_width: 210,
                    thumbnail_height: 118
                }
                res.send(response)
                return
            })
        } else {
            res.sendStatus(404);
        }
        
    } else {
        res.sendStatus(404);
    }
    
})

app.listen(port, () => console.log('oembed listening on port '+port))

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

function getVideo(author, permlink, cb) {
    lightrpc.send('get_state', [`/dtube/@${author}/${permlink}`], function(err, result) {
        if (err) {
            cb(err)
            return
        }
        //console.log(result.content[author+'/'+permlink])
        var video = parseVideo(result.content[author+'/'+permlink])
        if (!video.content || !video.info) {
            cb(new Error('Weird Error'))
            return;
        }
        var hashVideo = video.content.video480hash ? video.content.video480hash : video.content.videohash
        var upvotedBy = []
        var downvotedBy = []
        for (let i = 0; i < video.active_votes.length; i++) {
            if (parseInt(video.active_votes[i].rshares) > 0)
                upvotedBy.push(video.active_votes[i].voter);    
            if (parseInt(video.active_votes[i].rshares) < 0)
                downvotedBy.push(video.active_votes[i].voter);         
        }

        var html = '<iframe width="480" height="270" src="https://emb.d.tube/#!/'+author+'/'+permlink+'" frameborder="0" allowfullscreen></iframe>'
        
        var url = rootDomain+'/#!/v/'+video.info.author+'/'+video.info.permlink
        var snap = 'https://ipfs.io/ipfs/'+video.info.snaphash
        var urlVideo = 'https://ipfs.io/ipfs/'+hashVideo
        var duration = video.info.duration || null
        var description = video.content.description.replace(/(?:\r\n|\r|\n)/g, ' ').substr(0, 300)
        cb(null, html, video.info.title, description, url, snap, urlVideo, duration)
    })
}

function parseVideo(video, isComment) {
    try {
        if (video && video.json_metadata)
            var newVideo = JSON.parse(video.json_metadata).video
    } catch(e) {
        console.log(e)
    }
    if (!newVideo) newVideo = {}
    newVideo.active_votes = video.active_votes
    newVideo.author = video.author
    newVideo.body = video.body
    newVideo.total_payout_value = video.total_payout_value
    newVideo.curator_payout_value = video.curator_payout_value
    newVideo.pending_payout_value = video.pending_payout_value
    newVideo.permlink = video.permlink
    newVideo.created = video.created
    newVideo.net_rshares = video.net_rshares
    newVideo.reblogged_by = video.reblogged_by
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
