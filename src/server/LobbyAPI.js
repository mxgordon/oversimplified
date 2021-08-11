import express from 'express'

const router = express.Router()

export default  class LobbyAPI {
    constructor(storage, router) {
        this.storage = storage
        this.router = router

        for (let key in this) {
            if (this[key] instanceof Function) {
                this[key] = this[key].bind(this)
            }
        }

        router.get("/game", this.getGame)
        router.get("/matches", this.getMatches)
        router.get("/matches/:matchID", this.getMatch)
        router.post("/matches/create", this.createMatch)
        router.post("/matches/:matchID/join", this.joinMatch)
        router.post("/matches/:matchID/leave", this.leaveMatch)
        router.param("matchID", this.matchDetails)
    }

    getGame(req, res) {
        // TODO give information about the game
    }

    getMatches(req, res) {
        // TODO list matches
    }

    getMatch(req, res) {
        // TODO give info about the match
    }
    
    createMatch(req, res) {
        // TODO create a match 
    }

    joinMatch(req, res) {
        // TODO join a match
    }
    
    leaveMatch(req, res) {
        // TODO leave a match
    }

    matchDetails(req, res, next, id) {
        // TODO add data about the match to the request object
        next()
    }
}