/*

TO-DO
- actual graphics
    - planets
    - indicate gift planets
    - indicate homeworlds
    - show fuel on planets
- actual ui
    - end-screen
- make avatar slower when clicking closer to it

BUGS & TUNING
- some homeworlds still have gifts?
- weird circle in upper-left when sense radii are on

STRETCH
- edge randomness
    - some aliens are randomly HUGE
    - some aliens are lone wanderers
    - some aliens glitch-phase in and out of existence
        - if you give them a gift, they drop something cool
- behavior
    - aliens react to other flocks
    - communication
        - aliens talk at you
        - their speech is decoded when you become friends
        - they tell you about their planet, their culture, their lives
    - colonial expansion
        - when you give an alien a gift, they have the ability to colonize an empty planet
            - maybe one (random) alien becomes a 'queen' and explores nearby planets
        - that planet then becomes a homeworld for a new batch of aliens
- visuals
    - ship trails
    - parallax bg
- gameplay
    - camera follows avatar instead of centering on it
    - improve performance
    - you can leave beacons to fast-travel back to that sector
    - you get a map or something at the end, showing planets you visited and aliens you befriended
    - keyboard controls

*/

let DEBUG = true
let ZOOM = 1
const FPS = 60

const PI = Math.PI
const RADIANS = (PI * 2) / 360
const DEGREES = 360 / (PI * 2)

const SCREEN_SIZE = 800
const SECTOR_SIZE = 600
const SYSTEM_RATE = 0.33

const MIN_STAR_RADIUS = 20
const MAX_STAR_RADIUS = 100

const MAX_ORBIT_RADIUS = SECTOR_SIZE

const MAX_PLANETS = 6
const MIN_PLANET_RADIUS = 5
const MAX_PLANET_RADIUS = 30
const NEXT_PLANET_POWER = 1.5
const MIN_PLANET_SPEED = PI / 36000
const MAX_PLANET_SPEED = PI / 3600

const ALIEN_RATE = 0.5

const AVATAR_SPEED = 10
const AVOID_AVATAR = 0.3

const FUEL_RATE = 1 / (FPS * 60 * 2)

const GIFT_RATE = 0.1
const MIN_GIFT_REGEN = FPS * 60
const MAX_GIFT_REGEN = FPS * 600
const GIFT_SPEED = 0.05
const GIFT_RADIUS = 3
const GIFT_DISTANCE = 10
const MAX_GIFTS = 6

const SECTOR = 0
const POS = 1
const RADIUS = 2

const COLORS = {
    'background': 'white',
    'avatar': 'hotpink',
    'star': '#ccc',
    'planet': 'black',
    'orbit': '#eee',
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

const absPosition = (sector, pos) => {
    const sectorOffset = scale(sector, SECTOR_SIZE)
    const adjustedPos = add(sectorOffset, pos)
    return adjustedPos
}

const stringifyCoords = (coords) => {
    return `${coords[0]}, ${coords[1]}`
}

const stringifyPlanetCoords = (coords, planetIndex) => {
    return `${coords[0]}, ${coords[1]}, ${planetIndex}`
}

class Game {

    constructor(canvas, avatar) {
        this.screen = document.getElementById('screen')
        this.frame = document.getElementById('frame')

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
        document.addEventListener('mousemove', e => this.changeDirection(e))
        document.addEventListener('mouseup', e => this.stopMoving(e))

        el.addEventListener('touchstart', e => this.startMoving(e.touches[0]))
        document.addEventListener('touchmove', e => this.changeDirection(e.touches[0]))
        document.addEventListener('touchend', e => this.stopMoving(e.touches[0]))

        el.addEventListener('contextmenu', e => e.preventDefault())
        el.addEventListener('MSHoldVisual', e => e.preventDefault())
    }

    startMoving(e) {
        this.mouseDown = true
        this.changeDirection(e)

        this.dropGift()
    }

    stopMoving() {
        this.mouseDown = false
    }

    changeDirection(e) {
        if (this.mouseDown) {
            const offsetX = this.frame.offsetLeft + this.screen.offsetLeft
            const offsetY = this.frame.offsetTop + this.screen.offsetTop
            const zoomX = SCREEN_SIZE / this.screen.offsetWidth / ZOOM
            const zoomY = SCREEN_SIZE / this.screen.offsetHeight / ZOOM
            const x = (e.clientX - offsetX) * zoomX
            const y = (e.clientY - offsetY) * zoomY
            this.mousePos = [x, y]
        }
    }

    dropGift() {
        if (this.avatar.gifts <= 0) return
        let mousePos = sub(this.mousePos, this.canvas.cameraOffset)
        let diff = sub(mousePos, this.avatar.pos)
        let sqDist = square(diff)
        let maxDist = this.avatar.r + GIFT_DISTANCE + GIFT_RADIUS
        if (sqDist < maxDist * maxDist) {
            this.galaxy.avatar.gifts--
            this.galaxy.gifts.push([this.galaxy.avatar.sector, this.galaxy.avatar.pos, GIFT_RADIUS])
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

        this.canvas.update(this.galaxy, this.currentSector)

        if (DEBUG) {
            this.canvas.context.font = '12px sans-serif'
            this.canvas.context.fillStyle = COLORS.debug
            this.canvas.context.fillText(`${this.currentSector[0]}, ${this.currentSector[1]}`, SCREEN_SIZE / 2, 22)

            this.canvas.context.font = '24px sans-serif'
            this.canvas.context.fillStyle = 'hotpink'
            this.canvas.context.fillText(Math.floor(this.avatar.fuel * 100), SCREEN_SIZE / 2, SCREEN_SIZE - 22)
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
        this.context.lineCap = 'round'

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

    drawShape(sector, pos, drawFn, settings) {
        pos = sector ? this.getOffset(sector, pos) : pos
        this.context.save()
        this.context.translate(pos[0], pos[1])
        this.context.beginPath()

        drawFn(this.context)

        this.context.restore()

        if (settings.fill) {
            this.context.fillStyle = settings.fill
            this.context.fill()
        }

        if (settings.stroke) {
            this.context.lineWidth = settings.width || 1
            this.context.strokeStyle = settings.stroke
            this.context.stroke()
        }
    }

    drawArc(sector, pos, r, settings) {
        const draw = context => context.arc(0, 0, r, settings.start, settings.end, settings.anticlockwise)
        this.drawShape(sector, pos, draw, settings)
    }

    drawCircle(sector, pos, r, settings) {
        const draw = context => context.arc(0, 0, r, 0, PI * 2)
        this.drawShape(sector, pos, draw, settings)
    }

    drawRect(sector, pos, width, height, settings) {
        const draw = context => context.rect(0, 0, width, height)
        this.drawShape(sector, pos, draw, settings)
    }

    drawLine(sector, pos, endSector, endPos, settings) {
        const draw = context => {
            context.moveTo(0, 0)
            const relSector = sub(sector, endSector)
            const relEndPos = absPosition(relSector, endPos)
            context.lineTo(relEndPos[0], relEndPos[1])
        }
        this.drawShape(sector, pos, draw, settings)
    }

    drawSimpleLine(pos1, pos2, settings) {
        this.context.beginPath()
        this.context.moveTo(pos1[0], pos1[1])
        this.context.lineTo(pos2[0], pos2[1])

        this.context.lineWidth = settings.width || 1
        this.context.strokeStyle = settings.stroke
        this.context.stroke()
    }

    clear() {
        this.context.clearRect(0, 0, SCREEN_SIZE, SCREEN_SIZE)
    }

    drawFuel(galaxy) {
        let halfScreen = SCREEN_SIZE / 2
        let edgeOffset = 10
        let r = halfScreen - edgeOffset
        let startAngle = 0 - (PI / 2)
        let endAngle = PI * 2 * (1 - galaxy.avatar.fuel) - (PI / 2)

        let isLow = galaxy.avatar.fuel < 0.2

        let settings = {
            start: startAngle,
            end: endAngle,
            anticlockwise: true,
            width: isLow ? 6 : 3,
            stroke: isLow ? 'hotpink' : 'black',

        }
        this.drawArc(null, [halfScreen, halfScreen], r, settings)
    }

    update(galaxy, currentSector) {
        this.clear()
        this.currentSector = currentSector

        // draw background
        this.context.fillStyle = '#eee'
        this.context.fillRect(0, 0, SCREEN_SIZE, SCREEN_SIZE)

        this.context.save()
        this.context.scale(ZOOM, ZOOM)

        // update and draw galaxy
        galaxy.update(this)

        this.context.restore()

        // draw UI elements
        this.drawFuel(galaxy)
    }

}

class Galaxy {

    constructor() {
        this.sectorCache = {}
        this.sectorCacheKeys = []
        this.maxCache = 100
        this.range = 2

        this.planetCache = {}

        this.flockCache = {}
        this.flockCacheKeys = []
        this.maxFlockCache = 10

        this.obstacles = []
        this.avatar = null

        this.gifts = []
        this.friends = {}

        this.ticks = 0
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
        const sector = new Sector(this, coords)
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

    update(canvas, galaxy) {
        this.ticks++

        const sectorsInRange = this.sectorsInRange(canvas.currentSector)

        this.obstacles = [
            [this.avatar.sector, this.avatar.pos, this.avatar.r]
        ]

        let stars = []
        let planets = []
        let orbits = []

        sectorsInRange.forEach(coords => {

            const sector = this.getSector(coords, sectorsInRange)
            sector.update(canvas)

            if (sector.star) {
                stars.push(sector.star)

                this.obstacles.push([coords, sector.star.pos, sector.star.r])

                sector.star.planets.forEach(planet => {
                    planets.push(planet)
                    orbits.push(planet.orbit)

                    this.obstacles.push([coords, planet.pos, planet.r])

                    // check to see if avatar is touching a planet with fuel
                    if (planet.hasFuel) {
                        let diff = sub(planet.absPos, this.avatar.absPos)
                        if (square(diff) < Math.pow(planet.r + this.avatar.r, 2)) {
                            this.avatar.pickUpFuel()
                            planet.pickUpFuel(this)
                        }
                    }

                    // check to see if avatar is touching a planet with a gift
                    if (planet.hasGift && this.avatar.gifts < MAX_GIFTS) {
                        let diff = sub(planet.absPos, this.avatar.absPos)
                        if (square(diff) < Math.pow(planet.r + GIFT_DISTANCE + this.avatar.r, 2)) {
                            this.avatar.pickUpGift()
                            planet.pickUpGift(this)
                        }
                    }
                })

            }

        })

        const flocks = this.flockCacheKeys.map(key => this.flockCache[key])

        orbits.forEach(orbit => orbit.update(canvas, this))
        stars.forEach(star => star.update(canvas, this))
        planets.forEach(planet => planet.update(canvas, this))
        this.gifts.forEach(gift => Gift.update(gift, canvas, this))
        flocks.forEach(flock => flock.update(canvas, this))
        this.avatar.update(canvas, this)

    }

}

class Sector {

    constructor(galaxy, coords) {
        this.coords = coords

        // create a random seed based on the sector's coordinates -
        // this way the sector remains consistent even when offscreen,
        // without having to keep track of it in memory
        this.rng = new Math.seedrandom(`coordinates: ${coords[0]}, ${coords[1]}`)

        // some sectors have star systems
        const hasStar = Math.abs(noise.simplex2(coords[0], coords[1])) <= SYSTEM_RATE
        if (hasStar) this.star = new Star(galaxy, this, this.coords, this.rng)

        // some sectors have aliens
        if (hasStar && this.star.planets.length > 0) {
            const hasFlock = this.rng() <= ALIEN_RATE
            if (hasFlock) {
                const homeworldIndex = randInt(this.rng, 0, this.star.planets.length)
                const homeworld = this.star.planets[homeworldIndex]
                this.flock = new Flock(stringifyCoords(this.coords), this.coords, homeworld, this.rng)
            }
        }
    }

    update(canvas) {
        if (DEBUG) canvas.drawRect(this.coords, [0, 0], SECTOR_SIZE, SECTOR_SIZE, { stroke: COLORS.debug })
    }

}

class Star {

    constructor(galaxy, parentSector, sector, rng) {
        this.parentSector = parentSector
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
            if (orbitRadius <= MAX_ORBIT_RADIUS) this.planets.push(new Planet(galaxy, this, i, orbitRadius, planetRadius, rng))
        }
    }

    drawRays(canvas, galaxy) {
        const numRays = this.r * 2
        const rayAngle = (PI * 2) / numRays
        const rayLength = this.r * 0.2
        const rayTime = 200
        const settings = { stroke: 'black', width: 1 }
        const timeMod = Math.sin((galaxy.ticks % rayTime) / rayTime * PI * 2)
        for (var i = 0; i < numRays; i++) {
            const angle = i * rayAngle
            const baseLength = this.r + rayLength
            const length = baseLength + (Math.sin(angle * numRays / 6) * rayLength * timeMod)
            const x = Math.cos(angle) * length
            const y = Math.sin(angle) * length
            canvas.drawLine(this.sector, this.pos, this.sector, [x, y], settings)
        }
    }

    update(canvas, galaxy) {
        this.drawRays(canvas, galaxy)
        canvas.drawCircle(this.sector, this.pos, this.r, { fill: 'black' })
    }

}

class Orbit {

    constructor(sector, pos, r) {
        this.sector = sector
        this.pos = pos
        this.r = r
    }

    update(canvas) {
        canvas.drawCircle(this.sector, this.pos, this.r, { stroke: 'black', width: 0.1 })
    }

}

class Planet {

    constructor(galaxy, star, index, orbitRadius, r, rng) {
        this.index = index
        this.sector = star.sector

        this.orbit = new Orbit(this.sector, star.pos, orbitRadius)

        this.r = r
        this.startAngle = randFloat(rng, 0, PI * 2)
        this.angle = this.startAngle
        this.speed = randFloat(rng, MIN_PLANET_SPEED, MAX_PLANET_SPEED)
        this.pos = this.calcPos()
        this.absPos = absPosition(this.sector, this.pos)

        this.growsGifts = rng() <= GIFT_RATE
        if (star.parentSector.flock) this.growsGifts = false
        this.giftRegenRate = randInt(rng, MIN_GIFT_REGEN, MAX_GIFT_REGEN)

        this.hasFuel = this.getCache(galaxy, 'hasFuel') || false
        this.hasGift = this.getCache(galaxy, 'hasGift') || this.growsGifts
        this.lastGiftPickup = this.getCache(galaxy, 'lastGiftPickup') || 0
    }

    getCache(galaxy, key) {
        const planetKey = stringifyPlanetCoords(this.sector, this.index)
        if (!galaxy.planetCache[planetKey]) return undefined
        else galaxy.planetCache[planetKey][key]
    }

    setCache(galaxy, key, value) {
        const planetKey = stringifyPlanetCoords(this.sector, this.index)
        if (!galaxy.planetCache[planetKey]) galaxy.planetCache[planetKey] = {}
        galaxy.planetCache[planetKey][key] = value
        this[key] = value
    }

    generateFuel(galaxy) {
        this.setCache(galaxy, 'hasFuel', true)
    }

    generateGift(galaxy) {
        this.setCache(galaxy, 'hasGift', true)
    }

    pickUpFuel(galaxy) {
        this.setCache(galaxy, 'hasFuel', false)
    }

    pickUpGift(galaxy) {
        this.setCache(galaxy, 'hasGift', false)
        this.setCache(galaxy, 'lastGiftPickup', galaxy.ticks)
    }

    calcPos() {
        const unitVector = [Math.cos(this.angle), Math.sin(this.angle)]
        const scaledVector = scale(unitVector, this.orbit.r)
        const orbitalPosition = add(scaledVector, this.orbit.pos)
        return orbitalPosition
    }

    drawGift(canvas, galaxy) {
        let ticksPerRotation = (PI * 2) / GIFT_SPEED
        let remainderTicks = galaxy.ticks % ticksPerRotation
        let rotationPortion = remainderTicks / ticksPerRotation
        let angle = this.startAngle + (rotationPortion * PI * 2)

        let relPos = [
            Math.cos(angle) * (this.r + GIFT_DISTANCE),
            Math.sin(angle) * (this.r + GIFT_DISTANCE)
        ]
        let giftPos = add(this.pos, relPos)

        canvas.drawCircle(this.sector, giftPos, GIFT_RADIUS, { fill: 'black' })
    }

    update(canvas, galaxy) {
        // move the planet along its orbital path
        const ticksPerRotation = (PI * 2) / this.speed
        const remainderTicks = galaxy.ticks % ticksPerRotation
        const rotationPortion = remainderTicks / ticksPerRotation
        this.angle = this.startAngle + (rotationPortion * PI * 2)
        if (this.angle > PI * 2) this.angle -= PI * 2
        this.pos = this.calcPos()
        this.absPos = absPosition(this.sector, this.pos)

        // regrow gifts
        if (this.growsGifts && galaxy.ticks > this.lastGiftPickup + this.giftRegenRate) {
            this.generateGift(galaxy)
        }

        // draw planets
        // if (this.growsGifts) canvas.drawCircle(this.sector, this.pos, this.r + 4, { stroke: 'green' })
        // if (this.hasGift) canvas.drawCircle(this.sector, this.pos, this.r + 4, { fill: 'green' })
        if (this.hasFuel) canvas.drawCircle(this.sector, this.pos, this.r + 4, { stroke: 'hotpink' })
        canvas.drawCircle(this.sector, this.pos, this.r, { fill: 'white', stroke: 'black', width: 2 })

        // draw gifts
        if (this.hasGift) this.drawGift(canvas, galaxy)
    }

}

class Avatar {

    constructor(sector, pos) {
        this.sector = sector
        this.pos = pos
        this.vel = [0, 0]
        this.acc = [0, 0]
        this.absPos = absPosition(sector, pos)
        this.r = 10

        this.maxSpeed = 5
        this.maxForce = 0.9
        this.seekDist = SECTOR_SIZE / 2

        this.target = pos
        this.gifts = 0
        this.fuel = 1

        this.giftAngle = 0
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

    seekMouse(galaxy) {
        const seekMouse = this.seek(galaxy.currentSector, this.target)
        const isMoving = Math.abs(seekMouse[0]) > 0 || Math.abs(seekMouse[1]) > 0
        if (isMoving) this.fuel -= FUEL_RATE
        if (this.fuel > 0) this.applyForce(seekMouse)
    }

    pickUpGift() {
        this.gifts++
    }

    pickUpFuel() {
        this.fuel++
        if (this.fuel > 1) this.fuel = 1
    }

    avoidObstacles(galaxy) {
        let obstacles = galaxy.obstacles.slice(1) // all but me, the avatar
        let avoid = [0,0]
        obstacles.forEach(obstacle => {
            let obstaclePos = absPosition(obstacle[SECTOR], obstacle[POS])
            let diff = sub(this.absPos, obstaclePos)
            let minDist = obstacle[RADIUS] + this.r
            if (square(diff) < minDist * minDist) {
                avoid = add(avoid, setMag(diff, this.maxForce * 2))
            }
        })
        this.applyForce(avoid)
    }

    updatePos() {
        this.vel = limit(add(this.vel, this.acc), this.maxSpeed)
        this.pos = add(this.pos, this.vel)
        this.acc = [0, 0]
        this.absPos = absPosition(this.sector, this.pos)
    }

    update(canvas, galaxy) {
        this.seekMouse(galaxy)
        this.avoidObstacles(galaxy)

        this.updatePos()
        this.draw(canvas)
    }

    drawGifts(canvas) {
        let numGifts = this.gifts

        this.giftAngle += GIFT_SPEED
        if (this.giftAngle > PI * 2) this.giftAngle -= PI * 2
        let angleOffset = (PI * 2) / MAX_GIFTS

        for (var i = 0; i < numGifts; i++) {
            let angle = this.giftAngle + (i * angleOffset)
            let relPos = [
                Math.cos(angle) * (this.r + GIFT_DISTANCE),
                Math.sin(angle) * (this.r + GIFT_DISTANCE)
            ]
            let giftPos = add(this.pos, relPos)
            canvas.drawCircle(this.sector, giftPos, GIFT_RADIUS, { fill: 'black' })
        }
    }

    draw(canvas) {
        this.drawGifts(canvas)

        if (DEBUG) canvas.drawCircle(this.sector, this.target, this.r, { stroke: COLORS.debug })
        canvas.drawCircle(this.sector, this.pos, this.r, { fill: 'black' })
    }

}

class Boid {

    constructor(index, flock, sector, rng) {
        this.index = index
        this.flock = flock

        this.sector = sector

        let planet = this.flock.planet
        let minDist = planet.r + flock.r
        let dist = randInt(Math.random, minDist, minDist * 10)
        let angle = randFloat(Math.random, 0, PI * 2)
        let relPos = [Math.cos(angle) * dist, Math.sin(angle) * dist]
        this.pos = add(planet.pos, relPos)
        if (this.pos[0] < 0) this.pos[0] = 0
        if (this.pos[1] < 0) this.pos[1] = 0
        if (this.pos[0] > SECTOR_SIZE) this.pos[0] = SECTOR_SIZE
        if (this.pos[1] > SECTOR_SIZE) this.pos[1] = SECTOR_SIZE

        this.absPos = absPosition(this.sector, this.pos)
        this.vel = [0, 0]
        this.acc = [0, 0]
        this.angle = 0

        this.isCurious = rng() <= flock.curiousRate
        this.hasGift = false

        this.sightDist = this.isCurious ? flock.sightDist * 2 : flock.sightDist
        this.sightSquared = this.sightDist * this.sightDist
    }

    applyForce(force) {
        this.acc = add(this.acc, force)
    }

    seek(target) {
        let desired = sub(target, this.absPos)
        desired = scale(desired, this.flock.maxSpeed)
        let steer = sub(desired, this.vel)
        steer = limit(steer, this.flock.maxForce)

        return steer
    }

    arrive(target, distance) {
        let desired = sub(target, this.absPos)
        let d = mag(desired)
        if (d < distance) {
            let m = mapValue(d, 0, distance, 0, this.flock.maxSpeed)
            desired = scale(desired, m)
        }
        else {
            desired = scale(desired, this.flock.maxSpeed)
        }
        let steer = sub(desired, this.vel)
        steer = limit(steer, this.flock.maxForce)

        return steer
    }

    wander(target, radius) {
        let angle = Math.random() * PI * 2
        let vector = [Math.cos(angle) * radius, Math.sin(angle) * radius]
        let goal = add(target, vector)
        return goal
    }

    seekGifts(galaxy) {
        let giftsLeft = []

        galaxy.gifts.forEach(gift => {
            let giftPos = absPosition(gift[SECTOR], gift[POS])
            let diff = sub(giftPos, this.absPos)

            // seek gifts within sight
            if (square(diff) < this.sightSquared) {
                let giftPos = absPosition(gift[SECTOR], gift[POS])
                let giftForce = this.arrive(giftPos, this.sightDist)
                this.applyForce(giftForce)
            }

            // pick up gifts when you hit them
            let touchDist = gift[RADIUS] + this.flock.r
            if (square(diff) < touchDist * touchDist) {
                this.hasGift = true
                this.flock.pickUpGift()
            }
            else {
                // only keep gifts around that haven't been picked up
                giftsLeft.push(gift)
            }
        })

        galaxy.gifts = giftsLeft
    }

    deliverGifts(galaxy) {
        if (!this.hasGift) return

        let planet = this.flock.planet
        let diff = sub(planet.absPos, this.absPos)

        // return home when you have a gift
        let planetGoal = this.wander(planet.absPos, planet.r * 2)
        let planetForce = this.arrive(planetGoal)
        planetForce = scale(planetForce, 2)
        this.applyForce(planetForce)

        // deliver gift when you touch your homeworld
        let minDist = (planet.r * 2) + this.flock.r
        if (square(diff) < minDist * minDist) {
            this.hasGift = false
            this.flock.deliverGift(galaxy)
        }
    }

    handleGifts(galaxy) {
        this.seekGifts(galaxy)
        this.deliverGifts(galaxy)
    }

    returnHome() {
        let planet = this.flock.planet
        let diff = sub(planet.absPos, this.absPos)
        let distSquared = square(diff)
        let maxDist = SECTOR_SIZE * this.flock.exploreForce
        let distForce = Math.min(1, (distSquared * distSquared) / Math.pow(maxDist, 4))
        let returnForce = setMag(diff, distForce)
        returnForce = limit(returnForce, this.flock.maxForce)
        this.applyForce(returnForce)
    }

    flocking() {
        let boidsInSight = 0
        let boidsTouching = 0

        let aliSum = [0, 0]
        let cohSum = [0, 0]
        let sepSum = [0, 0]

        this.flock.boids.forEach(other => {
            if (other.index === this.index) return

            let diff = sub(other.pos, this.pos)
            let distSquared = square(diff)

            if (distSquared < this.flock.sightSquared) {
                boidsInSight++
                aliSum = add(aliSum, diff)
                cohSum = add(cohSum, other.pos)

                let minDist = this.flock.r * 2
                if (distSquared < minDist * minDist) {
                    boidsTouching++
                    sepSum = add(sepSum, normalize(diff))
                }
            }
        })

        let ali = [0, 0]
        let coh = [0, 0]
        let sep = [0, 0]

        if (boidsInSight > 0) {
            ali = scale(aliSum, 1 / boidsInSight)
            ali = setMag(ali, this.flock.maxSpeed)
            ali = sub(ali, this.vel)
            ali = limit(ali, this.flock.maxForce)
            ali = scale(ali, this.flock.aliForce)

            coh = scale(cohSum, 1 / boidsInSight)
            coh = this.seek(absPosition(this.sector, coh))
            coh = scale(coh, this.flock.cohForce)
        }

        if (boidsTouching > 0) {
            sep = scale(sepSum, 1 / boidsTouching)
            sep = setMag(sep, this.flock.maxSpeed)
            sep = sub(sep, this.vel)
            sep = limit(sep, this.flock.maxForce)
            sep = scale(sep, this.flock.sepForce)
        }

        this.applyForce(ali)
        this.applyForce(coh)
        this.applyForce(sep)
    }

    avoidObstacles(galaxy) {
        let obstacles = galaxy.obstacles
        let avoid = [0,0]
        obstacles.forEach(obstacle => {
            let obstaclePos = absPosition(obstacle[SECTOR], obstacle[POS])
            let diff = sub(this.absPos, obstaclePos)
            let minDist = obstacle[RADIUS] + this.flock.r
            if (square(diff) < minDist * minDist) {
                avoid = add(avoid, setMag(diff, this.flock.maxForce * 3))
            }
        })
        this.applyForce(avoid)
    }

    approachAvatar(galaxy) {
        let avatar = galaxy.avatar
        let diff = sub(avatar.absPos, this.absPos)

        let avatarForce = this.flock.avatarForce
        if (this.isCurious || this.flock.isFriend) avatarForce = avatarForce > 0 ? avatarForce * 1.5 : avatarForce * -1
        if (this.hasGift) avatarForce *= 0.1

        if (square(diff) < this.sightSquared) {
            let avatarGoal = this.wander(avatar.absPos, (avatar.r + this.flock.r) * 2)
            let approach = this.arrive(avatarGoal, this.sightDist)
            approach = scale(approach, avatarForce)
            this.applyForce(approach)
        }
    }

    wanderRandomly() {
        let d = this.flock.r * 2
        let forward = [
            Math.cos(this.angle) * d,
            Math.sin(this.angle) * d
        ]
        forward = add(this.absPos, forward)
        let goal = this.wander(forward, d)
        let approach = this.seek(goal)
        approach = scale(approach, 0.1)
        this.applyForce(approach)
    }

    updatePos() {
        this.vel = add(this.vel, this.acc)
        this.vel = limit(this.vel, this.flock.maxSpeed)
        this.pos = add(this.pos, this.vel)
        this.absPos = absPosition(this.sector, this.pos)
        this.acc = [0, 0]
    }

    update(canvas, galaxy) {
        this.flocking()
        this.avoidObstacles(galaxy)
        this.handleGifts(galaxy)
        this.returnHome()
        this.approachAvatar(galaxy)
        this.wanderRandomly()

        this.updatePos()
        this.draw(canvas)
    }

    drawGift(canvas, angle) {
        let relPos = [
            Math.cos(angle) * (this.flock.r + GIFT_DISTANCE / 2),
            Math.sin(angle) * (this.flock.r + GIFT_DISTANCE / 2)
        ]
        let giftPos = add(this.pos, relPos)

        canvas.drawCircle(this.sector, giftPos, GIFT_RADIUS, { fill: 'black' })
    }

    draw(canvas) {
        if (DEBUG && this.flock.isFriend) canvas.drawCircle(this.sector, this.pos, this.flock.r + 2, { stroke: COLORS.debug })
        // if (DEBUG) canvas.drawCircle(this.sector, this.pos, this.sightDist, { stroke: COLORS.debug })
        if (DEBUG && this.isCurious) canvas.drawCircle(this.sector, this.pos, this.flock.r, { stroke: 'hotpink' })

        this.angle = Math.atan2(this.vel[1], this.vel[0])

        const bezPoint1 = this.flock.bezPoint1
        const bezPoint2 = this.flock.bezPoint2
        const scale = this.flock.r * 1.5 // smaller than expected because bezpoints can stretch ships outside bounds

        const drawing = context => {
            context.rotate(this.angle)
            context.scale(scale, scale)
            context.translate(-0.5, 0)
            context.moveTo(0, 0)
            context.bezierCurveTo(
                bezPoint1[0], -bezPoint1[1],
                bezPoint2[0], -bezPoint2[1],
                1, 0)
            context.bezierCurveTo(
                bezPoint2[0], bezPoint2[1],
                bezPoint1[0], bezPoint1[1],
                0, 0)
        }

        const settings = { fill: 'white', stroke: 'black', width: 1 }

        canvas.drawShape(this.sector, this.pos, drawing, settings)

       if (this.hasGift) this.drawGift(canvas, this.angle)
    }

}

class Flock {

    constructor(index, sector, planet, rng) {
        this.index = index
        this.sector = sector
        this.planet = planet

        this.maxSpeed = randFloat(rng, 0.5, 4)
        this.maxForce = randFloat(rng, 0.1, 0.01)
        this.r = 15

        this.sightDist = randInt(rng, 50, 200)
        this.sightSquared = this.sightDist * this.sightDist

        this.aliForce = randFloat(rng, 0.1, 1.0)
        this.cohForce = randFloat(rng, 0.1, 1.0)
        this.sepForce = -2.0

        this.exploreForce = randFloat(rng, 1, 10)
        this.avatarForce = randFloat(rng, -1, 1)
        this.curiousRate = randFloat(rng, 0, 0.1)

        this.giftForce = randFloat(rng, 0.1, 0.5)
        this.hasGift = false
        this.isFriend = false

        this.bezPoint1 = scale(sub([rng(), rng()], [0.5, 0.5]), 2)
        this.bezPoint2 = scale(sub([rng(), rng()], [0.5, 0.5]), 2)

        const numBoids = randInt(rng, 1, 20)
        this.boids = []
        for(var i = 0; i < numBoids; i++) {
            this.boids.push(new Boid(i, this, sector, rng))
        }
    }

    pickUpGift() {
        this.hasGift = true
    }

    deliverGift(galaxy) {
        this.hasGift = false
        this.makeFriend()
        galaxy.friends[stringifyCoords(this.sector)] = true
        this.planet.generateFuel(galaxy)
    }

    makeFriend() {
        this.isFriend = true
    }

    update(canvas, galaxy) {
        this.boids.forEach(boid => boid.update(canvas, galaxy))
    }

}

class Gift {

    static update(gift, canvas, galaxy) {
        canvas.drawCircle(gift[SECTOR], gift[POS], gift[RADIUS], { fill: 'black' })
    }

}

window.onload = () => {

    noise.seed(42)

    const game = new Game()
    game.start()

}