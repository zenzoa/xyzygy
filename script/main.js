/*

TODO
- if your fuel runs out, the game ends
- ui for fuel and gifts
- actual graphics
- fix bug where some boids go flying off in a direction and keep going

STRETCH
- add wandering behavior when boids are outside alignment/coherence range
- you can leave beacons to fast-travel back to that sector
- you get a map or something at the end, showing planets you visited and aliens you befriended
- make avatar slower when clicking closer to it, maybe make camera follow instead of center

*/

let DEBUG = true
let ZOOM = 1
const PI = Math.PI
const RADIANS = (PI * 2) / 360
const DEGREES = 360 / (PI * 2)
const FPS = 60
const SCREEN_SIZE = 600
const SECTOR_SIZE = 600
const SYSTEM_RATE = 0.33
const MIN_BACKGROUND_STARS = 10
const MAX_BACKGROUND_STARS = 20
const MIN_STAR_RADIUS = 20
const MAX_STAR_RADIUS = 100
const MAX_PLANETS = 6
const MIN_PLANET_RADIUS = 5
const MAX_PLANET_RADIUS = 30
const MAX_ORBIT_RADIUS = SECTOR_SIZE
const NEXT_PLANET_POWER = 1.5
const MIN_PLANET_SPEED = PI / 36000
const MAX_PLANET_SPEED = PI / 3600
const ALIEN_RATE = 0.5
const GIFT_RATE = 0.1
const AVATAR_SPEED = 10
const AVOID_AVATAR = 0.3

// sin/cos lookup tables
let sinValues = []
let cosValues = []
for (var i = 0; i < 3600; i++) {
    const angle = (i / 10) * RADIANS
    sinValues[i] = Math.sin(angle)
    cosValues[i] = Math.cos(angle)
}
const sin = (angle) => {
    return sinValues[Math.floor(angle * DEGREES * 10)]
}
const cos = (angle) => {
    return cosValues[Math.floor(angle * DEGREES * 10)]
}

const COLORS = {
    'background': 'white',
    'avatar': 'hotpink',
    'star': '#ccc',
    'planet': 'black',
    'orbit': '#eee',
    'boid': 'plum',
    'debug': 'pink'
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

const absPosition = (sector, pos) => {
    const sectorOffset = scale(sector, SECTOR_SIZE)
    const adjustedPos = add(sectorOffset, pos)
    return adjustedPos
}

const stringifyCoords = (coords) => {
    return `${coords[0]}, ${coords[1]}`
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
        this.galaxy.avatar = this.avatar

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

        document.addEventListener('keydown', e => {
            if (e.key === ' ' && this.galaxy.avatar.gifts > 0) {
                this.galaxy.avatar.gifts--
                this.galaxy.gifts.push(new Gift(this.galaxy.avatar.sector, this.galaxy.avatar.pos))
            }
        })
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
        else this.avatar.target = this.avatar.pos

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

        this.canvas.update([this.galaxy], this.currentSector)

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

    drawLine(sector, start, end, color) {
        start = this.getOffset(sector, start)
        end = this.getOffset(sector, end)

        this.setColor(color)

        this.context.beginPath()
        this.context.moveTo(start[0], start[1])
        this.context.lineTo(end[0], end[1])
        this.context.stroke()
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

        this.flockCache = {}
        this.flockCacheKeys = []
        this.maxFlockCache = 10

        this.obstacles = []
        this.avatar = null

        this.gifts = []
        this.friends = {}
    }

    getSector(coords, sectorsInRange) {
        const key = stringifyCoords(coords)
        if (!this.sectorCache[key]) this.cacheSector(coords, key, sectorsInRange)
        return this.sectorCache[key]
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

    cacheSector(coords, key, sectorsInRange) {
        const sector = new Sector(coords)
        this.sectorCache[key] = sector
        this.sectorCacheKeys.push(key)
        if (this.sectorCacheKeys.length > this.maxCache) this.uncacheSector(sectorsInRange)

        // add flock to cache
        if (sector.flock) {
            if (this.friends[key]) sector.flock.makeFriend()
            this.flockCache[key] = sector.flock
            this.flockCacheKeys.push(key)
            if (this.flockCacheKeys.length > this.maxFlockCache) this.uncacheFlocks(sectorsInRange)
        }
    }

    uncacheSector(sectorsInRange = []) {
        const sectorsOutOfRange = this.sectorCacheKeys.filter(key => !sectorsInRange.includes(key))
        if (sectorsOutOfRange.length === 0) return

        const keyToRemove = sectorsOutOfRange[0]
        this.sectorCache[keyToRemove] = undefined
        this.sectorCacheKeys = this.sectorCacheKeys.slice(1)
    }

    uncacheFlocks(sectorsInRange = []) {
        const range = SECTOR_SIZE * 0.5 * this.range
        const squareRange = range * range
        const absAvatarPos = absPosition(this.avatar.sector, this.avatar.pos)
        let keysToRemove = []

        this.flockCacheKeys.forEach(key => {
            if (sectorsInRange.includes(key)) return

            const flock = this.flockCache[key]
            let boidsWithinRange = false

            flock.boids.forEach(boid => {
                const absBoidPos = absPosition(boid.sector, boid.pos)
                const diff = sub(absAvatarPos, absBoidPos)
                if (square(diff) < squareRange) boidsWithinRange = true
            })

            if (!boidsWithinRange) keysToRemove.push(key)
        })

        keysToRemove.forEach(keyToRemove => { this.flockCache[keyToRemove] = undefined })
        this.flockCacheKeys = this.flockCacheKeys.filter(key => !keysToRemove.includes(key))
    }

    update(canvas) {

        const sectorsInRange = this.sectorsInRange(canvas.currentSector)

        this.obstacles = [new Attractor(this.avatar.sector, this.avatar.pos, this.avatar.r, -2.0)]

        let stars = []
        let planets = []
        let orbits = []

        sectorsInRange.forEach(coords => {

            const sector = this.getSector(coords, sectorsInRange)
            sector.update(canvas)

            if (sector.star) {
                stars.push(sector.star)

                this.obstacles.push(new Attractor(coords, sector.star.pos, sector.star.r, -2.0))

                sector.star.planets.forEach(planet => {
                    planets.push(planet)
                    orbits.push(planet.orbit)

                    this.obstacles.push(new Attractor(coords, planet.pos, planet.r, -2.0))

                    // check to see if avatar is touching a planet with fuel
                    if (planet.hasFuel) {
                        this.avatar.checkAttractor(coords, planet.pos, planet.r, () => {
                            console.log('gain some fuel')
                            planet.hasFuel = false
                        })
                    }
                    if (planet.hasGift) {
                        this.avatar.checkAttractor(coords, planet.pos, planet.r, () => {
                            console.log('pick up a gift')
                            this.avatar.gifts++
                            planet.hasGift = false
                        })
                    }
                })

            }

        })

        const flocks = this.flockCacheKeys.map(key => this.flockCache[key])

        orbits.forEach(orbit => orbit.update(canvas, this))
        stars.forEach(star => star.update(canvas, this))
        this.gifts.forEach(gift => gift.update(canvas, this))
        flocks.forEach(flock => flock.update(canvas, this))
        planets.forEach(planet => planet.update(canvas, this))
        this.avatar.update(canvas, this)

    }

}

class Sector {

    constructor(coords) {
        this.coords = coords

        // create a random seed based on the sector's coordinates -
        // this way the sector remains consistent even when offscreen,
        // without having to keep track of it in memory
        this.rng = new Math.seedrandom(`coordinates: ${coords[0]}, ${coords[1]}`)

        const numBackgroundStars = randInt(this.rng, MIN_BACKGROUND_STARS, MAX_BACKGROUND_STARS)
        this.backgroundStars = []
        for (var i = 0; i < numBackgroundStars; i++) {
            const x = randInt(this.rng, 0, SECTOR_SIZE)
            const y = randInt(this.rng, 0, SECTOR_SIZE)
            const r = randInt(this.rng, MIN_STAR_RADIUS * 0.1, MAX_STAR_RADIUS * 0.1)
            this.backgroundStars.push([x, y, r])
        }

        // some sectors have star systems
        const hasStar = Math.abs(noise.simplex2(coords[0], coords[1])) <= SYSTEM_RATE
        if (hasStar) this.star = new Star(this.coords, this.rng)

        // some sectors have aliens
        if (hasStar && this.star.planets.length > 0) {
            const hasFlock = this.rng() <= ALIEN_RATE
            if (hasFlock) {
                const homeworldIndex = randInt(this.rng, 0, this.star.planets.length)
                const homeworld = this.star.planets[homeworldIndex]
                this.flock = new Flock(this.coords, homeworld, this.rng)
            }
        }
    }

    drawBackgroundStars(canvas) {
        this.backgroundStars.forEach(starCoords => {
            canvas.drawCircle(this.coords, starCoords, starCoords[2], '#eee')
        })
    }

    update(canvas) {
        this.drawBackgroundStars(canvas)
        if (DEBUG) canvas.drawRect(this.coords, [0, 0], SECTOR_SIZE, COLORS.debug, 'stroke')
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
        let lastPlanetRadius = this.r
        for (var i = 0; i < numPlanets; i++) {
            const planetRadius = randInt(rng, MIN_PLANET_RADIUS, MAX_PLANET_RADIUS)
            lastPlanetRadius = planetRadius
            const separation = lastPlanetRadius + planetRadius
            orbitRadius += randInt(rng, separation, separation * Math.pow(i + 1, NEXT_PLANET_POWER))
            if (orbitRadius <= MAX_ORBIT_RADIUS) this.planets.push(new Planet(this, orbitRadius, planetRadius, rng))
        }
    }

    update(canvas) {
        canvas.drawCircle(this.sector, this.pos, this.r, COLORS.star)
    }

}

class Orbit {

    constructor(sector, pos, r) {
        this.sector = sector
        this.pos = pos
        this.r = r
    }

    update(canvas) {
        canvas.drawCircle(this.sector, this.pos, this.r, COLORS.orbit, 'stroke')
    }

}

class Planet {

    constructor(star, orbitRadius, r, rng) {
        this.sector = star.sector

        this.orbit = new Orbit(this.sector, star.pos, orbitRadius)

        this.r = r
        this.angle = randFloat(rng, 0, PI * 2)
        this.speed = randFloat(rng, MIN_PLANET_SPEED, MAX_PLANET_SPEED)
        this.pos = this.calcPos()

        this.ticks = 0
        this.doesGrow = rng() <= GIFT_RATE
        this.growthRate = FPS * 100
        this.hasGift = this.doesGrow

        this.hasFuel = false
    }

    calcPos() {
        // const unitVector = [Math.cos(this.angle), Math.sin(this.angle)]
        const unitVector = [cos(this.angle), sin(this.angle)]
        const scaledVector = scale(unitVector, this.orbit.r)
        const orbitalPosition = add(scaledVector, this.orbit.pos)
        return orbitalPosition
    }

    update(canvas) {
        // move the planet along its orbital path
        this.angle += this.speed
        if (this.angle > PI * 2) this.angle -= PI * 2
        this.pos = this.calcPos()

        if (this.hasGift) canvas.drawCircle(this.sector, this.pos, this.r + 4, 'green')
        if (this.hasFuel) canvas.drawCircle(this.sector, this.pos, this.r + 4, COLORS.debug, 'stroke')
        canvas.drawCircle(this.sector, this.pos, this.r, COLORS.planet)
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
        this.absPos = absPosition(sector, pos)
    }

    applyForce(force) {
        this.acc = add(this.acc, force)
    }

    seek(targetSector, targetPos, targetDist) {
        const diff = targetDist || sub(targetPos, this.pos)
        let force
        if (square(diff) < this.seekDist * this.seekDist) {
            const dist = mag(diff)
            const m = mapValue(dist, 0, this.seekDist, 0, this.maxSpeed)
            force = setMag(diff, m)
        }
        else force = setMag(diff, this.maxSpeed)

        return limit(sub(diff, this.vel), this.maxForce)
    }

    checkAttractor(sector, pos, r, callback) {
        const attractorAbsPos = absPosition(sector, pos)
        const diff = sub(attractorAbsPos, this.absPos)
        if (square(diff) < Math.pow(r + this.r, 2)) callback(diff)
    }

    applyAttractors(attractors, canvas) {
        let force = [0, 0]
        attractors.forEach(attractor => {
            this.checkAttractor(attractor.sector, attractor.pos, attractor.r, (diff) => {
                let seek = this.seek(attractor.sector, attractor.pos, diff)
                seek = scale(seek, attractor.force)
                force = add(force, seek)
            })
        })
        return force
    }

    updatePos() {
        this.vel = limit(add(this.vel, this.acc), this.maxSpeed)
        this.pos = add(this.pos, this.vel)
        this.acc = [0, 0]
        this.absPos = absPosition(this.sector, this.pos)
    }
}

class Avatar extends Vehicle {

    constructor(sector, pos) {
        super(sector, pos, 5, 0.9, SECTOR_SIZE / 2)
        this.r = 10
        this.target = pos
        this.gifts = 0
    }

    update(canvas, galaxy) {
        const seekMouse = this.seek(galaxy.currentSector, this.target)
        this.applyForce(seekMouse)

        const attract = this.applyAttractors(galaxy.obstacles.slice(1), canvas)
        this.applyForce(attract)

        this.updatePos()

        if (DEBUG) canvas.drawCircle(this.sector, this.target, this.r, COLORS.debug, 'stroke')
        canvas.drawCircle(this.sector, this.pos, this.r, COLORS.avatar)
    }

}

class Boid extends Vehicle {

    constructor(index, flock, sector, pos) {
        super(sector, pos, flock.maxSpeed, flock.maxForce, flock.seekDist)
        this.r = 5
        this.index = index
        this.flock = flock
        this.hasGift = false
    }

    handleFlocking() {
        let sep = [0, 0]
        let sepSum = [0, 0]
        let sepCount = 0

        let ali = [0, 0]
        let aliSum = [0, 0]
        let aliCount = 0

        let coh = [0, 0]
        let cohSum = [0, 0]
        let cohCount = 0

        this.flock.boids.forEach(other => {
            if (other.index === this.index) return
            const diff = sub(this.pos, other.pos)
            const dist = square(diff)

            if (dist < Math.pow(this.flock.sepDist + this.r, 2)) {
                sepSum = add(sepSum, normalize(diff))
                sepCount++
            }

            if (dist < Math.pow(this.flock.aliDist + this.r, 2)) {
                aliSum = add(aliSum, diff)
                aliCount++
            }

            if (dist < Math.pow(this.flock.cohDist + this.r, 2)) {
                cohSum = add(cohSum, other.pos)
                cohCount++
            }
        })

        if (sepCount > 0) {
            sepSum = scale(sepSum, 1 / sepCount)
            sepSum = setMag(sepSum, this.maxSpeed)
            sep = limit(sub(sepSum, this.vel), this.maxForce)
        }

        if (aliCount > 0) {
            aliSum = scale(aliSum, 1 / aliCount)
            aliSum = setMag(aliSum, this.maxSpeed)
            ali = limit(sub(aliSum, this.vel), this.maxForce)
        }

        if (cohCount > 0) {
            cohSum = scale(cohSum, 1 / cohCount)
            coh = this.seek(this.sector, cohSum)
        }

        sep = scale(sep, this.flock.sepForce)
        ali = scale(ali, this.flock.aliForce)
        coh = scale(coh, this.flock.cohForce)

        return {sep, ali, coh}
    }

    handleGifts(galaxy) {
        // pick up gifts
        let giftsLeft = []
        galaxy.gifts.forEach(gift => {
            let giftTouched = false
            this.checkAttractor(gift.sector, gift.pos, gift.r, () => (giftTouched = true))
            if (giftTouched) {
                this.hasGift = true
                this.flock.pickUpGift()
            }
            else giftsLeft.push(gift)
        })
        galaxy.gifts = giftsLeft

        // deliver gift if it touches the homeworld
        if (this.hasGift) {
            const planet = this.flock.planet
            this.checkAttractor(planet.sector, planet.pos, planet.r, () => {
                this.hasGift = false
                this.flock.deliverGift(galaxy)
            })
        }
    }

    handleHomeworld() {
        const planet = this.flock.planet
        const diff = sub(planet.pos, this.pos)
        const sqDist = square(diff)
        const maxDist = SECTOR_SIZE * 2
        const baseForce = this.flock.planetAttractor.force
        const distForce = Math.min(1, (sqDist * sqDist) / Math.pow(maxDist, 4))
        return limit(setMag(diff, distForce), this.maxSpeed)
    }

    applyBehaviors(canvas, galaxy) {
        const {sep, ali, coh} = this.handleFlocking()

        const homeworld = this.hasGift ? [0, 0] : this.handleHomeworld()

        this.handleGifts(galaxy)

        // handle attractors/obstacles
        const attractors = galaxy.obstacles
            .concat(this.flock.gifts)
            .concat([ this.flock.avatarAttractor ])
            .concat(this.hasGift ? [this.flock.planetAttractor] : [])
        const attract = this.applyAttractors(attractors, canvas)

        // apply final forces
        this.applyForce(sep)
        this.applyForce(ali)
        this.applyForce(coh)
        this.applyForce(attract)
        this.applyForce(homeworld)
    }

    update(canvas, galaxy) {
        this.applyBehaviors(canvas, galaxy)
        this.updatePos()
        if (DEBUG && (this.flock.isFriend || this.hasGift)) canvas.drawCircle(this.sector, this.pos, this.r + 2, COLORS.debug, 'stroke')
        canvas.drawCircle(this.sector, this.pos, this.r, COLORS.boid)
    }

}

class Flock {

    constructor(sector, planet, rng) {
        this.sector = sector
        this.planet = planet

        this.maxSpeed = randFloat(rng, 0.1, 5)
        this.maxForce = 0.1

        this.sepDist = 5
        this.aliDist = 100
        this.cohDist = 100
        this.seekDist = 100

        this.aliForce = randFloat(rng, 0.1, 1.0)
        this.cohForce = randFloat(rng, 0.1, 1.0)
        this.sepForce = 2.0

        this.planetDist = Infinity
        this.planetForce = randFloat(rng, 0.01, 0.1)
        this.planetAttractor = new Attractor(this.sector, [0, 0], this.planetDist, this.planetForce)

        this.avatarDist = 100 //randInt(rng, 100, SECTOR_SIZE)
        this.avatarForce = randFloat(rng, 0.01, 0.1)
        if (rng() <= AVOID_AVATAR) this.avatarForce = this.avatarForce * -1
        this.avatarAttractor = new Attractor([0, 0], [0, 0], this.avatarDist, this.avatarForce)

        this.giftDist = 100
        this.giftForce = randFloat(rng, 0.1, 0.5)
        this.hasGift = false
        this.isFriend = false

        const numBoids = randInt(rng, 1, 20)
        this.boids = []
        for(var i = 0; i < numBoids; i++) {
            this.boids.push(new Boid(i, this, sector, randVector(Math.random, SECTOR_SIZE)))
        }

        this.attractors = [ this.planetAttractor, this.avatarAttractor ]
        this.gifts = []
    }

    center() {
        let centerSum = [0, 0]
        this.boids.forEach(boid => {
            centerSum = add(centerSum, boid.pos)
        })
        return scale(centerSum, 1 / this.boids.length)
    }

    pickUpGift() {
        this.hasGift = true
    }

    deliverGift(galaxy) {
        this.hasGift = false
        this.planet.hasFuel = true
        this.makeFriend()
        galaxy.friends[stringifyCoords(this.sector)] = true
    }

    makeFriend() {
        this.isFriend = true
    }

    updateAttractors(galaxy) {
        this.planetAttractor.pos = this.planet.pos

        this.avatarAttractor.sector = galaxy.avatar.sector
        this.avatarAttractor.pos = galaxy.avatar.pos

        if (this.hasGift) {
            this.planetAttractor.force = 1.0
            this.avatarAttractor.force = this.avatarForce / 2
        }
        else if (this.isFriend) {
            this.planetAttractor.force = this.planetForce
            if (this.avatarForce > 0) this.avatarAttractor.force = this.avatarForce * 2
            else this.avatarAttractor.force = this.avatarForce * -1
        }
        else {
            this.planetAttractor.force = this.planetForce
            this.avatarAttractor.force = this.avatarForce
        }

        this.gifts = galaxy.gifts.map(gift => (new Attractor(gift.sector, gift.pos, this.giftDist, this.giftForce)))
    }

    update(canvas, galaxy) {
        this.updateAttractors(galaxy)
        this.boids.forEach(boid => boid.update(canvas, galaxy))
    }

}

class Attractor {

    constructor(sector, pos, r, force) {
        this.sector = sector
        this.pos = pos
        this.r = r
        this.force = force
    }

}

class Gift {

    constructor(sector, pos) {
        this.sector = sector
        this.pos = pos
        this.r = 5
    }

    update(canvas) {
        canvas.drawCircle(this.sector, this.pos, this.r, COLORS.debug)
    }

}

window.onload = () => {

    noise.seed(42)

    const game = new Game()
    game.start()

}