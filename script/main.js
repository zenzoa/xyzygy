/*

TODO
- some planets have alien civilizations
- alien ships are boids with randomized flocking behavior
    - ex. how much they like hanging out at their planet,
    - how much they like checking out you/other aliens

- some planets grow plants
- you can collect plants
- you can drop plants as offerings to aliens
- if they like the plant they will pick it up and return to their homeworld
- their homeworld will now have fuel crystals you can pick up to replenish your fuel supply
- you've now "befriended" the aliens and they'll follow you more closely
- if your fuel runs out, the game ends
    - you get a map or something at the end, showing planets you visited and aliens you befriended

- actual graphics and cool-looking planets

STRETCH
- you can leave beacons to fast-travel back to that sector
- you can land on a planet and get a randomized landscape
    - some planet have interesting features, they'll be some indicator while in "space mode"
    - homeworlds show the aliens/alien architecture

*/

let DEBUG = true
let ZOOM = 0.33
const PI = Math.PI
const FPS = 60
const SCREEN_SIZE = 512
const SECTOR_SIZE = 512
const SYSTEM_RATE = 0.33
const MIN_STAR_RADIUS = SECTOR_SIZE * 0.01
const MAX_STAR_RADIUS = SECTOR_SIZE * 0.1
const MAX_PLANETS = 6
const MIN_PLANET_RADIUS = MIN_STAR_RADIUS / 10
const MAX_PLANET_RADIUS = MAX_STAR_RADIUS / 4
const MIN_PLANET_SEPARATION = MAX_PLANET_RADIUS
const NEXT_PLANET_POWER = 1.5
const MIN_PLANET_SPEED = PI / 3600
const MAX_PLANET_SPEED = PI / 360
const AVATAR_SPEED = 10

const COLORS = {
    'background': 'white',
    'avatar': 'hotpink',
    'star': 'black',
    'planet': '#999',
    'orbit': '#999',
    'debug': 'hotpink'
}

const randFloat = (rng, min, max) => rng() * (max - min) + min
const randInt = (rng, min, max) => Math.floor(rng() * (max - min) + min)
const randVector = (rng, scale = 1) => [rng() * scale, rng() * scale]

const add = (v1, v2) => [v1[0] + v2[0], v1[1] + v2[1]]
const sub = (v1, v2) => [v1[0] - v2[0], v1[1] - v2[1]]
const scale = (v, s) => [v[0] * s, v[1] * s]

class Game {

    constructor(canvas, avatar) {

        // setup canvas
        this.canvas = new Canvas(document.getElementById('canvas'), SCREEN_SIZE, SCREEN_SIZE)

        // setup galaxy
        this.galaxy = new Galaxy()

        // start at a random sector
        // this.galaxy = new Galaxy(randInt(Math.random, -100, 100), randInt(Math.random, -100, 100))
        this.currentSector = [0, 0]

        // create player avatar
        this.avatar = new Shape(this.currentSector, [SECTOR_SIZE / 2, SECTOR_SIZE / 2], 10, COLORS.avatar)

        // initialize timer interval (used when starting the game timer)
        this.interval = null

        // add event handlers
        this.keys = []
        document.addEventListener('keydown', e => {
            if (!this.keys.includes(e.key)) this.keys.push(e.key)
        })
        document.addEventListener('keyup', e => {
            this.keys = this.keys.filter(key => key !== e.key)
        })

    }

    moveAvatar() {
        // check for movement direction
        let dx = 0
        let dy = 0
        if (this.keys.includes('ArrowUp')) dy -= 1
        if (this.keys.includes('ArrowDown')) dy += 1
        if (this.keys.includes('ArrowLeft')) dx -= 1
        if (this.keys.includes('ArrowRight')) dx += 1

        if (dx !== 0 || dy !== 0) {
            // move avatar
            const angle = Math.atan2(dy, dx)
            dx = Math.floor(Math.cos(angle) * AVATAR_SPEED)
            dy = Math.floor(Math.sin(angle) * AVATAR_SPEED)
            this.avatar.pos = add(this.avatar.pos, [dx, dy])

            // re-center the galaxy on whatever sector the avatar is now in
            let mx = 0
            let my = 0
            if (this.avatar.pos[0] < 0) mx = -1
            else if (this.avatar.pos[0] > SECTOR_SIZE) mx = 1
            if (this.avatar.pos[1] < 0) my = -1
            else if (this.avatar.pos[1] > SECTOR_SIZE) my = 1
            if (mx !== 0 || my !== 0) {
                this.currentSector = add(this.currentSector, [mx, my])
                this.avatar.sector = this.currentSector
                this.avatar.pos = add(this.avatar.pos, scale([mx, my], -SECTOR_SIZE))
            }
        }

        // center camera on avatar
        this.canvas.cameraOffset = sub(this.canvas.screenCenter, this.avatar.pos)
    }

    update() {
        this.moveAvatar()

        this.canvas.update([this.galaxy, this.avatar], this.currentSector)

        if (DEBUG) {
            this.canvas.context.font = '12px sans-serif'
            this.canvas.context.fillStyle = COLORS.debug
            this.canvas.context.fillText(`${this.currentSector[0]}, ${this.currentSector[1]}`, SCREEN_SIZE / 2, 22)
        }
    }

    start() {
        this.interval = setInterval(this.update.bind(this), 1000 / FPS)
    }

    stop() {
        clearInterval(this.interval)
        this.interval = null
    }

}

class Canvas {

    constructor(el, width, height) {
        this.el = el
        this.width = width
        this.height = height
        this.el.width = width
        this.el.height = height

        this.context = this.el.getContext('2d')

        this.interval = null

        this.cameraOffset = [
            SCREEN_SIZE / 2 - SECTOR_SIZE / 2,
            SCREEN_SIZE / 2 - SECTOR_SIZE / 2
        ]
    }

    get screenCenter() {
        if (this._zoom !== ZOOM || !this._screenCenter) {
            this._zoom = ZOOM
            this._screenCenter = [
                SCREEN_SIZE / 2 / ZOOM,
                SCREEN_SIZE / 2 / ZOOM
            ]
        }
        return this._screenCenter
    }

    clear() {
        this.context.clearRect(0, 0, SCREEN_SIZE, SCREEN_SIZE)
    }

    update(children, currentSector) {
        this.clear()

        // draw background
        this.context.fillStyle = COLORS.background
        this.context.fillRect(0, 0, SCREEN_SIZE, SCREEN_SIZE)

        this.context.save()
        this.context.scale(ZOOM, ZOOM)

        // update and draw children
        children.forEach(child => {
            if (child && child.update) child.update(this.context, currentSector, this.cameraOffset)
        })

        this.context.restore()
    }

}

class Shape {

    constructor(sector, pos, size, color, style = 'fill', type = 'circle') {
        this.sector = sector
        this.pos = pos
        this.size = size
        this.color = color
        this.style = style
        this.type = type
    }

    setColor(context) {
        context.strokeStyle = this.color
        context.fillStyle = this.color
    }

    drawCircle(context, pos) {
        context.arc(pos[0], pos[1], this.size, 0, PI * 2)
    }

    drawRect(context, pos) {
        context.rect(pos[0], pos[1], this.size, this.size)
    }

    update(context, currentSector, cameraOffset) {
        const relativeSector = sub(this.sector, currentSector)
        const sectorPos = scale(relativeSector, SECTOR_SIZE)
        const relativePos = add(sectorPos, this.pos)
        const offsetPos = add(relativePos, cameraOffset)

        context.beginPath()
        this.setColor(context)

        if (this.type === 'rect') this.drawRect(context, offsetPos)
        else  this.drawCircle(context, offsetPos)

        if (this.style === 'stroke') context.stroke()
        else context.fill()
    }

}

class Galaxy {

    constructor() {
        this.sectorCache = {}
        this.sectorCacheKeys = []
        this.maxCache = 100
        this.range = 1
    }

    sectorsInRange(currentSector) {
        let sectors = []
        for (var x = -this.range; x <= this.range; x++) {
            for (var y = -this.range; y <= this.range; y++) {
                sectors.push(add(currentSector, [x, y]))
            }
        }
        return sectors
    }

    uncacheSector(sectorsInRange) {
        const sectorsOutOfRange = this.sectorCacheKeys.filter(key => !sectorsInRange.includes(key))
        if (sectorsOutOfRange.length === 0) return

        const keyToRemove = sectorsOutOfRange[0]
        this.sectorCache[keyToRemove] = undefined
        this.sectorCacheKeys = this.sectorCacheKeys.slice(1)
    }

    cacheSector(coords, key, sectorsInRange) {
        this.sectorCache[key] = new Sector(coords)
        this.sectorCacheKeys.push(key)
        if (this.sectorCacheKeys.length > this.maxCache) this.uncacheSector(sectorsInRange)
    }

    getSector(coords, sectorsInRange) {
        const key = `${coords[0]}, ${coords[1]}`
        if (!this.sectorCache[key]) this.cacheSector(coords, key, sectorsInRange)
        return this.sectorCache[key]
    }

    update(context, currentSector, cameraOffset) {
        const sectorsInRange = this.sectorsInRange(currentSector)

        sectorsInRange.forEach(coords => {
            const sector = this.getSector(coords, sectorsInRange)
            sector.update(context, currentSector, cameraOffset)
        })
    }

}

class Sector {

    constructor(coords) {
        this.coords = coords

        // create a random seed based on the sector's coordinates -
        // this way the sector remains consistent even when offscreen,
        // without having to keep track of it in memory
        this.rng = new Math.seedrandom(`coordinates: ${coords[0]}, ${coords[1]}`)

        // some sectors have star systems
        const hasStar = Math.abs(noise.simplex2(coords[0], coords[1])) <= SYSTEM_RATE
        if (hasStar) this.star = new Star(this)

        // temp debug thing to show edges of sector
        this.shape = new Shape(coords, [0, 0], SECTOR_SIZE, COLORS.debug, 'stroke', 'rect')
    }

    update(context, currentSector, cameraOffset) {
        if (DEBUG) this.shape.update(context, currentSector, cameraOffset)
        if (this.star) this.star.update(context, currentSector, cameraOffset)
    }

}

class Star {

    constructor(sector) {
        this.sector = sector
        this.rng = sector.rng
        this.coords = sector.coords

        this.pos = randVector(this.rng, SECTOR_SIZE)
        this.r = randInt(this.rng, MIN_STAR_RADIUS, MAX_STAR_RADIUS)
        this.shape = new Shape(this.coords, this.pos, this.r, COLORS.star)

        // give the star a bunch of orbiting planets, spaced out somewhat
        const numPlanets = randInt(this.rng, 0, MAX_PLANETS + 1)
        this.planets = []
        let orbitRadius = this.r
        for (var i = 0; i < numPlanets; i++) {
            orbitRadius += randInt(this.rng, MIN_PLANET_SEPARATION, MIN_PLANET_SEPARATION * Math.pow(i + 1, NEXT_PLANET_POWER))
            this.planets.push(new Planet(this, orbitRadius))
        }
    }

    update(context, currentSector, cameraOffset) {
        this.shape.update(context, currentSector, cameraOffset)
        this.planets.forEach(planet => planet.update(context, currentSector, cameraOffset))
    }

}

class Planet {

    constructor(star, orbitRadius) {
        this.star = star
        this.rng = star.rng
        this.coords = star.coords

        this.r = randInt(this.rng, MIN_PLANET_RADIUS, MAX_PLANET_RADIUS)
        this.angle = randFloat(this.rng, 0, PI * 2)
        this.speed = randFloat(this.rng, MIN_PLANET_SPEED, MAX_PLANET_SPEED)
        this.orbitRadius = orbitRadius
        this.pos = this.calcPos()

        this.shape = new Shape(this.coords, this.pos, this.r, COLORS.planet)
        this.orbitShape = new Shape(this.coords, this.star.pos, this.orbitRadius, COLORS.orbit, 'stroke')
    }

    calcPos() {
        const unitVector = [Math.cos(this.angle), Math.sin(this.angle)]
        const scaledVector = scale(unitVector, this.orbitRadius)
        const orbitalPosition = add(scaledVector, this.star.pos)
        return orbitalPosition
    }

    update(context, currentSector, cameraOffset) {
        // move the planet along its orbital path
        this.angle += this.speed
        if (this.angle > PI * 2) this.angle -= PI * 2
        this.pos = this.calcPos()
        this.shape.pos = this.pos

        this.orbitShape.update(context, currentSector, cameraOffset)
        this.shape.update(context, currentSector, cameraOffset)
    }

}

window.onload = () => {

    noise.seed(42)

    const game = new Game()
    game.start()

}