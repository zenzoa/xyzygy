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

- actual graphics and cool-looking planets (use gradients)

- use bell-curves for randomizations so that you have rare outliers

STRETCH
- you can leave beacons to fast-travel back to that sector
- you can land on a planet and get a randomized landscape
    - some planet have interesting features, they'll be some indicator while in "space mode"
    - homeworlds show the aliens/alien architecture

*/

let DEBUG = true
let ZOOM = 0.5
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
const ALIEN_RATE = 0.1
const AVATAR_SPEED = 10

const COLORS = {
    'background': 'white',
    'avatar': 'hotpink',
    'star': 'black',
    'planet': '#999',
    'orbit': '#999',
    'boid': 'plum',
    'debug': 'hotpink'
}

const randFloat = (rng, min, max) => rng() * (max - min) + min
const randInt = (rng, min, max) => Math.floor(rng() * (max - min) + min)
const randVector = (rng, scale = 1) => [rng() * scale, rng() * scale]

const add = (v1, v2) => [v1[0] + v2[0], v1[1] + v2[1]]
const sub = (v1, v2) => [v1[0] - v2[0], v1[1] - v2[1]]
const scale = (v, s) => [v[0] * s, v[1] * s]
const square = (v) => v[0] * v[0] + v[1] * v[1]

const mag = (v) => {
    const a = Math.abs(v[0])
    const b = Math.abs(v[1])
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    return hi + 3 * lo / 32 + Math.max(0, 2 * lo - hi) / 8 + Math.max(0, 4 * lo - hi) / 16
}

const normalize = (v) => {
    const length = mag(v)
    return scale(v, 1 / length)
}

const setMag = (v, s) => {
    const length = mag(v)
    const mod = s / length
    return scale(v, mod)
}

const limit = (v, max) => {
    const length = mag(v)
    if (length < max) return v
    else return setMag(v, max)
}

const mapValue = (value, lo1, hi1, lo2, hi2) => {
    const base = (value - lo1) / (hi1 - lo1)
    return base * (hi2 - lo2) + lo2
}

class Game {

    constructor(canvas, avatar) {

        // setup canvas
        const el = document.getElementById('canvas')
        this.canvas = new Canvas(el, SCREEN_SIZE, SCREEN_SIZE)

        // setup galaxy
        this.galaxy = new Galaxy()

        // start at a random sector
        // this.galaxy = new Galaxy(randInt(Math.random, -100, 100), randInt(Math.random, -100, 100))
        this.currentSector = [0, 0]

        // create player avatar
        this.avatar = new Avatar(this.currentSector, [SECTOR_SIZE / 2, SECTOR_SIZE / 2])

        // initialize timer interval (used when starting the game timer)
        this.interval = null

        // add event handlers
        this.mouseDown = false
        this.mousePos = [0, 0]

        el.addEventListener('mousedown', e => this.startMoving(e))
        el.addEventListener('mousemove', e => this.changeDirection(e))
        document.addEventListener('mouseup', e => this.stopMoving(e))

        el.addEventListener('touchstart', e => this.startMoving(e.touches[0]))
        el.addEventListener('touchmove', e => this.changeDirection(e.touches[0]))
        document.addEventListener('touchend', e => this.stopMoving(e.touches[0]))

        el.addEventListener('contextmenu', e => e.preventDefault())
        el.addEventListener('MSHoldVisual', e => e.preventDefault())
    }

    startMoving(e) {
        this.mouseDown = true
        this.changeDirection(e)
    }

    stopMoving() {
        this.mouseDown = false
    }

    changeDirection(e) {
        if (this.mouseDown) {
            const x = (e.clientX - this.canvas.el.offsetLeft) / ZOOM
            const y = (e.clientY - this.canvas.el.offsetTop) / ZOOM
            this.mousePos = [x, y]
        }
    }

    moveAvatar() {
        // get movement direction
        if (this.mouseDown) this.avatar.target = sub(this.mousePos, this.canvas.cameraOffset)

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
            const posOffset = scale([mx, my], -SECTOR_SIZE)
            this.avatar.pos = add(this.avatar.pos, posOffset)
            this.avatar.target = add(this.avatar.target, posOffset)
        }

        // center camera on avatar
        this.canvas.cameraOffset = sub(this.canvas.screenCenter, this.avatar.pos)
    }

    update() {
        this.moveAvatar()

        this.canvas.update([this.galaxy, this.avatar, this.flock], this.currentSector)

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

        this.currentSector = [0, 0]

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

    getOffset(sector, pos) {
        const relativeSector = sub(sector, this.currentSector)
        const sectorPos = scale(relativeSector, SECTOR_SIZE)
        const relativePos = add(sectorPos, pos)
        const offsetPos = add(relativePos, this.cameraOffset)
        return offsetPos
    }

    setColor(color) {
        this.context.strokeStyle = color
        this.context.fillStyle = color
    }

    drawCircle(sector, pos, size, color, style = 'fill') {
        pos = this.getOffset(sector, pos)
        this.setColor(color)

        this.context.beginPath()
        this.context.arc(pos[0], pos[1], size, 0, PI * 2)

        if (style === 'stroke') this.context.stroke()
        else this.context.fill()
    }

    drawRect(sector, pos, size, color, style = 'fill') {
        pos = this.getOffset(sector, pos)
        this.setColor(color)

        this.context.beginPath()
        this.context.rect(pos[0], pos[1], size, size)

        if (style === 'stroke') this.context.stroke()
        else this.context.fill()
    }

    clear() {
        this.context.clearRect(0, 0, SCREEN_SIZE, SCREEN_SIZE)
    }

    update(children, currentSector) {
        this.clear()
        this.currentSector = currentSector

        // draw background
        this.context.fillStyle = COLORS.background
        this.context.fillRect(0, 0, SCREEN_SIZE, SCREEN_SIZE)

        this.context.save()
        this.context.scale(ZOOM, ZOOM)

        // update and draw children
        children.forEach(child => {
            if (child && child.update) child.update(this)
        })

        this.context.restore()
    }

}

class Galaxy {

    constructor() {
        this.sectorCache = {}
        this.sectorCacheKeys = []
        this.maxCache = 100
        this.range = 2
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

    update(canvas) {
        const sectorsInRange = this.sectorsInRange(canvas.currentSector)

        sectorsInRange.forEach(coords => {
            const sector = this.getSector(coords, sectorsInRange)
            sector.update(canvas)
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
        if (hasStar) this.star = new Star(this.coords, this.rng)
    }

    update(canvas) {
        if (DEBUG) canvas.drawRect(this.coords, [0, 0], SECTOR_SIZE, COLORS.debug, 'stroke')
        if (this.star) this.star.update(canvas)
    }

}

class Star {

    constructor(sector, rng) {
        this.sector = sector

        this.pos = randVector(rng, SECTOR_SIZE)
        this.r = randInt(rng, MIN_STAR_RADIUS, MAX_STAR_RADIUS)

        // give the star a bunch of orbiting planets, spaced out somewhat
        const numPlanets = randInt(rng, 0, MAX_PLANETS + 1)
        this.planets = []
        let orbitRadius = this.r
        for (var i = 0; i < numPlanets; i++) {
            orbitRadius += randInt(rng, MIN_PLANET_SEPARATION, MIN_PLANET_SEPARATION * Math.pow(i + 1, NEXT_PLANET_POWER))
            this.planets.push(new Planet(this, orbitRadius, rng))
        }
    }

    update(canvas) {
        canvas.drawCircle(this.sector, this.pos, this.r, COLORS.star)
        this.planets.forEach(planet => planet.update(canvas))
    }

}

class Planet {

    constructor(star, orbitRadius, rng) {
        this.sector = star.sector
        this.orbitPos = star.pos

        this.r = randInt(rng, MIN_PLANET_RADIUS, MAX_PLANET_RADIUS)
        this.angle = randFloat(rng, 0, PI * 2)
        this.speed = randFloat(rng, MIN_PLANET_SPEED, MAX_PLANET_SPEED)
        this.orbitRadius = orbitRadius
        this.pos = this.calcPos()

        this.attractor = new Attractor(this.pos, Infinity, 0.1)
        this.avoider = new Attractor(this.pos, this.r * 1.5, -1.0)
        this.starAvoider = new Attractor(star.pos, star.r * 1.5, -1.0)

        const hasFlock = rng() <= ALIEN_RATE
        if (hasFlock) {
            this.flock = new Flock(this.sector)
            this.flock.attractors = [
                this.attractor,
                this.avoider,
                this.starAvoider
            ]
        }
    }

    calcPos() {
        const unitVector = [Math.cos(this.angle), Math.sin(this.angle)]
        const scaledVector = scale(unitVector, this.orbitRadius)
        const orbitalPosition = add(scaledVector, this.orbitPos)
        return orbitalPosition
    }

    update(canvas) {

        // move the planet along its orbital path
        this.angle += this.speed
        if (this.angle > PI * 2) this.angle -= PI * 2
        this.pos = this.calcPos()

        if (this.flock) canvas.drawCircle(this.sector, this.pos, this.r + 2, COLORS.boid)
        canvas.drawCircle(this.sector, this.pos, this.r, COLORS.planet)
        canvas.drawCircle(this.sector, this.orbitPos, this.orbitRadius, COLORS.orbit, 'stroke')

        if (this.flock) {
            this.attractor.pos = this.pos
            this.avoider.pos = this.pos
            this.flock.update(canvas)
        }

    }

}

class Vehicle {
    constructor (sector, pos, maxSpeed, maxForce, seekDist) {
        this.sector = sector
        this.pos = pos
        this.vel = [0, 0]
        this.acc = [0, 0]
        this.maxSpeed = maxSpeed
        this.maxForce = maxForce
        this.seekDist = seekDist
    }

    applyForce(force) {
        this.acc = add(this.acc, force)
    }

    seek(target) {
        const desired = sub(target, this.pos)
        const desiredDist = mag(desired)

        let force
        if (desiredDist < this.seekDist) {
            const m = mapValue(desiredDist, 0, this.seekDist, 0, this.maxSpeed)
            force = setMag(desired, m)
        }
        else force = setMag(desired, this.maxSpeed)

        return limit(sub(desired, this.vel), this.maxForce)
    }

    updatePos() {
        this.vel = limit(add(this.vel, this.acc), this.maxSpeed)
        this.pos = add(this.pos, this.vel)
        this.acc = [0, 0]
    }
}

class Avatar extends Vehicle {

    constructor(sector, pos) {
        super(sector, pos, 10, 0.9, 100)
        this.target = pos
    }

    update(canvas) {
        if (mag(sub(this.target, this.pos)) > 1) {
            const seekMouse = this.seek(this.target)
            this.applyForce(seekMouse)
            this.updatePos()
        }

        if (DEBUG) canvas.drawCircle(this.sector, this.target, 10, COLORS.avatar, 'stroke')
        canvas.drawCircle(this.sector, this.pos, 10, COLORS.avatar)
    }

}

class Boid extends Vehicle {

    constructor(index, flock, sector, pos) {
        super(sector, pos, flock.maxSpeed, flock.maxForce, flock.seekDist)
        this.index = index
        this.flock = flock
    }

    applyBehaviors(boids) {
        let sep = [0, 0]
        let sepSum = [0, 0]
        let sepCount = 0

        let ali = [0, 0]
        let aliSum = [0, 0]
        let aliCount = 0

        let coh = [0, 0]
        let cohSum = [0, 0]
        let cohCount = 0

        boids.forEach(other => {
            if (other.index === this.index) return
            const diff = sub(this.pos, other.pos)
            const dist = mag(diff)

            if (dist < this.flock.sepDist) {
                sepSum = add(sepSum, normalize(diff))
                sepCount++
            }

            if (dist < this.flock.aliDist) {
                aliSum = add(aliSum, diff)
                aliCount++
            }

            if (dist < this.flock.cohDist) {
                cohSum = add(cohSum, other.pos)
                cohCount++
            }
        })

        if (sepCount > 0) {
            sepSum = scale(sepSum, 1 / sepCount)
            sepSum = setMag(sepSum, this.flock.maxSpeed)
            sep = limit(sub(sepSum, this.vel), this.flock.maxForce)
        }

        if (aliCount > 0) {
            aliSum = scale(aliSum, 1 / aliCount)
            aliSum = setMag(aliSum, this.flock.maxSpeed)
            ali = limit(sub(aliSum, this.vel), this.flock.maxForce)
        }

        if (cohCount > 0) {
            cohSum = scale(cohSum, 1 / cohCount)
            coh = this.seek(cohSum, this.flock.cohDist)
        }

        sep = scale(sep, this.flock.sepForce)
        ali = scale(ali, this.flock.aliForce)
        coh = scale(coh, this.flock.cohForce)

        let attract = [0, 0]
        this.flock.attractors.forEach(attractor => {
            const diff = sub(this.pos, attractor.pos)
            const dist = mag(diff)
            if (dist <= attractor.dist) {
                let seek = this.seek(attractor.pos)
                seek = scale(seek, attractor.force)
                attract = add(attract, seek)
            }
        })

        this.applyForce(sep)
        this.applyForce(ali)
        this.applyForce(coh)
        this.applyForce(attract)
    }

    update(canvas) {
        this.applyBehaviors(this.flock.boids)
        this.updatePos()
        canvas.drawCircle(this.sector, this.pos, 5, COLORS.boid)
    }

}

class Attractor {
    
    constructor(pos, dist, force) {
        this.pos = pos
        this.dist = dist
        this.force = force
    }

}

class Flock {

    constructor(sector, options = {}) {
        this.sector = sector

        this.maxSpeed = 5
        this.maxForce = 0.1

        this.sepForce = 2.0
        this.aliForce = 1.0
        this.cohForce = 1.0

        this.sepDist = 15
        this.aliDist = 100
        this.cohDist = 100
        this.seekDist = 100

        const numBoids = 10
        this.boids = []
        for(var i = 0; i < numBoids; i++) {
            this.boids.push(new Boid(i, this, sector, randVector(Math.random, SECTOR_SIZE)))
        }

        this.attractors = []
    }

    update(canvas) {
        this.boids.forEach(boid => boid.update(canvas))
    }

}

window.onload = () => {

    noise.seed(42)

    const game = new Game()
    game.start()

}