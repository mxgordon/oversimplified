import { GAME } from "../constants"

export class Match {
    constructor(id, setupData) {
        this.matchID = id
        this.setupData = setupData
        this.ctx = {turn: null, currentPlayer: null, players: []} 
        this.G = {}
        this.log = {}
    }

    start() {
        this.ctx = {...this.ctx, turn: 0, currentPlayer: 0}
        this.log.start = new Date().toISOString()

        this.G = GAME.setup(this.ctx, this.setupData)
    }

    addPlayer(player) {
        if (!this.hasStarted()) {
            player.id = this.ctx.players.length
            this.ctx.players.push(player)
        } else {
            throw new Error(`Could not add player ${player}, game already started`)
        }
    }

    removePlayer(id) {
        if (!this.hasStarted()) {
            this.ctx.players.splice(id, 1)
        } else {
            console.log(`Removing player ${id} during a game`)
            this.ctx.players.splice(id, 1)
        }
    }

    hasStarted() {
        return this.ctx.turn !== null
    }
}

export class Player {
    /**
     * @param {String} name Name of player
     * @param {Number} id   Order in which they joined
     */
    constructor(name, id) {
        this.name = name
        this.id = id
    }
}

// export class