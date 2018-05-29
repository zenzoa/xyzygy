/*

TO-DO
- pretty planets
    - indicate gift planets
    - indicate homeworlds
- make avatar slower when clicking closer to it

STRETCH
- edge randomness (maybe more likely as you get past galactic center)
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
    - improve performance (might be caching code)
    - you can leave beacons to fast-travel back to that sector
    - you get a map or something at the end, showing planets you visited and aliens you befriended
    - keyboard controls

*/

let DEBUG = false
let ZOOM = 1
let FPS = 60
let RANDOM_SEED = 42

let PI = Math.PI
let RADIANS = (PI * 2) / 360
let DEGREES = 360 / (PI * 2)

let SCREEN_SIZE = 800
let SECTOR_SIZE = 600
let SYSTEM_RATE = 0.33

let MIN_STAR_RADIUS = 20
let MAX_STAR_RADIUS = 100

let MAX_ORBIT_RADIUS = SECTOR_SIZE

let MAX_PLANETS = 6
let MIN_PLANET_RADIUS = 5
let MAX_PLANET_RADIUS = 30
let NEXT_PLANET_POWER = 1.5
let MIN_PLANET_SPEED = PI / 36000
let MAX_PLANET_SPEED = PI / 3600

let ALIEN_RATE = 0.5

let AVATAR_SPEED = 10
let AVOID_AVATAR = 0.3

let FUEL_RATE = 1 / (FPS * 60 * 2)

let GIFT_RATE = 0.1
let MIN_GIFT_REGEN = FPS * 60
let MAX_GIFT_REGEN = FPS * 600
let GIFT_SPEED = 0.05
let GIFT_RADIUS = 3
let GIFT_DISTANCE = 10
let MAX_GIFTS = 6

let SECTOR = 0
let POS = 1
let RADIUS = 2

let COLORS = {
    'debug': 'hotpink'
}

let randFloat = (rng, min, max) => rng() * (max - min) + min
let randInt = (rng, min, max) => Math.floor(rng() * (max - min) + min)
let randVector = (rng, scale = 1) => [rng() * scale, rng() * scale]

let add = (v1, v2) => [v1[0] + v2[0], v1[1] + v2[1]]
let sub = (v1, v2) => [v1[0] - v2[0], v1[1] - v2[1]]
let scale = (v, s) => [v[0] * s, v[1] * s]
let square = (v) => v[0] * v[0] + v[1] * v[1]

let mag = (v) => {
    let a = Math.abs(v[0])
    let b = Math.abs(v[1])
    let lo = Math.min(a, b)
    let hi = Math.max(a, b)
    return hi + 3 * lo / 32 + Math.max(0, 2 * lo - hi) / 8 + Math.max(0, 4 * lo - hi) / 16
}

let normalize = (v) => {
    let length = mag(v)
    return scale(v, 1 / length)
}

let setMag = (v, s) => {
    let length = mag(v)
    let mod = s / length
    return scale(v, mod)
}

let limit = (v, max) => {
    let length = mag(v)
    if (length < max) return v
    else return setMag(v, max)
}

let mapValue = (value, lo1, hi1, lo2, hi2) => {
    let base = (value - lo1) / (hi1 - lo1)
    return base * (hi2 - lo2) + lo2
}

let absPosition = (sector, pos) => {
    let sectorOffset = scale(sector, SECTOR_SIZE)
    let adjustedPos = add(sectorOffset, pos)
    return adjustedPos
}

let stringifyCoords = (coords) => {
    return `${coords[0]}, ${coords[1]}`
}

let stringifyPlanetCoords = (coords, planetIndex) => {
    return `${coords[0]}, ${coords[1]}, ${planetIndex}`
}

class Game {

    constructor(canvas, avatar) {
        this.screen = document.getElementById('screen')
        this.frame = document.getElementById('frame')

        // setup canvas
        let el = document.getElementById('canvas')
        this.canvas = new Canvas(el, SCREEN_SIZE, SCREEN_SIZE)

        // setup galaxy
        this.galaxy = new Galaxy()

        // start at a random sector
        // this.currentSector = [0, 0]
        this.currentSector = [
            randInt(Math.random, -50, 50),
            randInt(Math.random, -50, 50)
        ]

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
            let offsetX = this.frame.offsetLeft + this.screen.offsetLeft
            let offsetY = this.frame.offsetTop + this.screen.offsetTop
            let zoomX = SCREEN_SIZE / this.screen.offsetWidth / ZOOM
            let zoomY = SCREEN_SIZE / this.screen.offsetHeight / ZOOM
            let x = (e.clientX - offsetX) * zoomX
            let y = (e.clientY - offsetY) * zoomY
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
            let posOffset = scale([mx, my], -SECTOR_SIZE)
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
        let relativeSector = sub(sector, this.currentSector)
        let sectorPos = scale(relativeSector, SECTOR_SIZE)
        let relativePos = add(sectorPos, pos)
        let offsetPos = add(relativePos, this.cameraOffset)
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
        let draw = context => context.arc(0, 0, r, settings.start, settings.end, settings.anticlockwise)
        this.drawShape(sector, pos, draw, settings)
    }

    drawCircle(sector, pos, r, settings) {
        let draw = context => context.arc(0, 0, r, 0, PI * 2)
        this.drawShape(sector, pos, draw, settings)
    }

    drawRect(sector, pos, width, height, settings) {
        let draw = context => context.rect(0, 0, width, height)
        this.drawShape(sector, pos, draw, settings)
    }

    drawLine(sector, pos, endSector, endPos, settings) {
        let draw = context => {
            context.moveTo(0, 0)
            let relSector = sub(sector, endSector)
            let relEndPos = absPosition(relSector, endPos)
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
        let fuel = galaxy.avatar.fuel

        let halfScreen = SCREEN_SIZE / 2
        let edgeOffset = 10
        let r = halfScreen - edgeOffset
        let startAngle = 0 - (PI / 2)
        let remainingFuel = fuel === 1 ? 1 : 1 - fuel
        let endAngle = PI * 2 * remainingFuel - (PI / 2)

        let isLow = false // fuel < 0.2

        let settings = {
            start: startAngle,
            end: endAngle,
            anticlockwise: true,
            width: isLow ? 6 : 3,
            stroke: isLow ? 'hotpink' : 'black',

        }
        this.drawArc(null, [halfScreen, halfScreen], r, settings)

        if (fuel <= 0) this.drawEndScreen()
    }

    drawEndScreen() {
        let halfScreen = SCREEN_SIZE / 2
        this.drawCircle(null, [halfScreen, halfScreen], halfScreen, { fill: 'black' })

        this.context.font = '24px monospace'
        this.context.fillStyle = 'white'
        this.context.fillText('you ran out of fuel', halfScreen - 120, halfScreen)
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
        let key = stringifyCoords(coords)
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
        let sector = new Sector(this, coords)
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
        let sectorsOutOfRange = this.sectorCacheKeys.filter(key => !sectorsInRange.includes(key))
        if (sectorsOutOfRange.length === 0) return

        let keyToRemove = sectorsOutOfRange[0]
        this.sectorCache[keyToRemove] = undefined
        this.sectorCacheKeys = this.sectorCacheKeys.slice(1)
    }

    uncacheFlocks(sectorsInRange = []) {
        let range = SECTOR_SIZE * 0.5 * this.range
        let squareRange = range * range
        let absAvatarPos = absPosition(this.avatar.sector, this.avatar.pos)
        let keysToRemove = []

        this.flockCacheKeys.forEach(key => {
            if (sectorsInRange.includes(key)) return

            let flock = this.flockCache[key]
            let boidsWithinRange = false

            flock.boids.forEach(boid => {
                let absBoidPos = absPosition(boid.sector, boid.pos)
                let diff = sub(absAvatarPos, absBoidPos)
                if (square(diff) < squareRange) boidsWithinRange = true
            })

            if (!boidsWithinRange) keysToRemove.push(key)
        })

        keysToRemove.forEach(keyToRemove => { this.flockCache[keyToRemove] = undefined })
        this.flockCacheKeys = this.flockCacheKeys.filter(key => !keysToRemove.includes(key))
    }

    update(canvas, galaxy) {
        this.ticks++

        let sectorsInRange = this.sectorsInRange(canvas.currentSector)

        this.obstacles = [
            [this.avatar.sector, this.avatar.pos, this.avatar.r]
        ]

        let stars = []
        let planets = []
        let orbits = []

        sectorsInRange.forEach(coords => {

            let sector = this.getSector(coords, sectorsInRange)
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

        let flocks = this.flockCacheKeys.map(key => this.flockCache[key])

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
        let hasStar = Math.abs(noise.simplex2(coords[0], coords[1])) <= SYSTEM_RATE
        if (hasStar) this.star = new Star(galaxy, this, this.coords, this.rng)

        // some sectors have aliens
        if (hasStar && this.star.planets.length > 0) {
            let hasFlock = this.rng() <= ALIEN_RATE
            if (hasFlock) {
                let homeworldIndex = randInt(this.rng, 0, this.star.planets.length)
                let homeworld = this.star.planets[homeworldIndex]
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
        let numPlanets = randInt(rng, 0, MAX_PLANETS + 1)
        this.planets = []
        let orbitRadius = this.r
        let lastPlanetRadius = this.r
        for (var i = 0; i < numPlanets; i++) {
            let planetRadius = randInt(rng, MIN_PLANET_RADIUS, MAX_PLANET_RADIUS)
            lastPlanetRadius = planetRadius
            let separation = lastPlanetRadius + planetRadius
            orbitRadius += randInt(rng, separation, separation * Math.pow(i + 1, NEXT_PLANET_POWER))
            if (orbitRadius <= MAX_ORBIT_RADIUS) this.planets.push(new Planet(galaxy, this, i, orbitRadius, planetRadius, rng))
        }
    }

    drawRays(canvas, galaxy) {
        let numRays = this.r * 2
        let rayAngle = (PI * 2) / numRays
        let rayLength = this.r * 0.2
        let rayTime = 200
        let settings = { stroke: 'black', width: 1 }
        let timeMod = Math.sin((galaxy.ticks % rayTime) / rayTime * PI * 2)
        for (var i = 0; i < numRays; i++) {
            let angle = i * rayAngle
            let baseLength = this.r + rayLength
            let length = baseLength + (Math.sin(angle * numRays / 6) * rayLength * timeMod)
            let x = Math.cos(angle) * length
            let y = Math.sin(angle) * length
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
        this.giftRegenRate = randInt(rng, MIN_GIFT_REGEN, MAX_GIFT_REGEN)

        this.hasFuel = this.getCache(galaxy, 'hasFuel') || false
        this.hasGift = this.getCache(galaxy, 'hasGift') || this.growsGifts
        this.lastGiftPickup = this.getCache(galaxy, 'lastGiftPickup') || 0
        this.isHomeworld = false
    }

    getCache(galaxy, key) {
        let planetKey = stringifyPlanetCoords(this.sector, this.index)
        if (!galaxy.planetCache[planetKey]) return undefined
        else galaxy.planetCache[planetKey][key]
    }

    setCache(galaxy, key, value) {
        let planetKey = stringifyPlanetCoords(this.sector, this.index)
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
        let unitVector = [Math.cos(this.angle), Math.sin(this.angle)]
        let scaledVector = scale(unitVector, this.orbit.r)
        let orbitalPosition = add(scaledVector, this.orbit.pos)
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
        let ticksPerRotation = (PI * 2) / this.speed
        let remainderTicks = galaxy.ticks % ticksPerRotation
        let rotationPortion = remainderTicks / ticksPerRotation
        this.angle = this.startAngle + (rotationPortion * PI * 2)
        if (this.angle > PI * 2) this.angle -= PI * 2
        this.pos = this.calcPos()
        this.absPos = absPosition(this.sector, this.pos)

        // regrow gifts
        if (this.growsGifts && galaxy.ticks > this.lastGiftPickup + this.giftRegenRate) {
            this.generateGift(galaxy)
        }

        // draw planets
        if (this.growsGifts) {

        }
        if (this.isHomeworld) {

        }
        canvas.drawCircle(this.sector, this.pos, this.r, { fill: 'white', stroke: 'black', width: 2 })

        // draw gifts
        if (this.hasGift) this.drawGift(canvas, galaxy)

        // draw fuel
        if (this.hasFuel) canvas.drawCircle(this.sector, this.pos, this.r + 4, { stroke: 'black', width: 1 })
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
        this.angle = 0

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
        let diff = targetDist || sub(targetPos, this.pos)
        let force
        if (square(diff) < this.seekDist * this.seekDist) {
            let dist = mag(diff)
            let m = mapValue(dist, 0, this.seekDist, 0, this.maxSpeed)
            force = setMag(diff, m)
        }
        else force = setMag(diff, this.maxSpeed)

        return limit(sub(diff, this.vel), this.maxForce)
    }

    seekMouse(galaxy) {
        let seekMouse = this.seek(galaxy.currentSector, this.target)
        let isMoving = Math.abs(seekMouse[0]) > 0 || Math.abs(seekMouse[1]) > 0
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

        let scale = this.r
        if (Math.abs(this.vel[0]) > 0 || Math.abs(this.vel[1]) > 0) {
            this.angle = Math.atan2(this.vel[1], this.vel[0])
        }

        let drawing = context => {
            context.rotate(this.angle)
            context.scale(scale, scale)
            context.translate(-0.5, -0.5)
            context.rect(0, 0,  1, 1)
        }

        let settings = { fill: 'black' }

        canvas.drawShape(this.sector, this.pos, drawing, settings)

        if (DEBUG) canvas.drawCircle(this.sector, this.target, this.r, { stroke: COLORS.debug })
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

        let bezPoint1 = this.flock.bezPoint1
        let bezPoint2 = this.flock.bezPoint2
        let scale = this.flock.r * 1.5 // smaller than expected because bezpoints can stretch ships outside bounds

        let drawing = context => {
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

        let settings = { fill: 'white', stroke: 'black', width: 1 }

        canvas.drawShape(this.sector, this.pos, drawing, settings)

       if (this.hasGift) this.drawGift(canvas, this.angle)
    }

}

class Flock {

    constructor(index, sector, planet, rng) {
        this.index = index
        this.sector = sector
        this.planet = planet
        planet.isHomeworld = true
        planet.growsGifts = false

        let onOutskirts = square(sub(sector, [0, 0])) > 100 * 100 // far from galactic center?

        this.maxSpeed = randFloat(rng, 0.5, 4)
        this.maxForce = randFloat(rng, 0.1, 0.01)

        let size = rng()
        let isHuge = onOutskirts && size < 0.01 // a few are HUGE
        let isTiny = onOutskirts && size > 0.99 // a few are TINY
        if (isHuge) this.r = randFloat(rng, 50, 100)
        else if (isTiny) this.r = randFloat(rng, 2, 5)
        else this.r = randFloat(rng, 10, 20)

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

        let numBoids = isHuge ? randInt(rng, 1, 10) : randInt(rng, 1, 20) // fewer boids if huge
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

    noise.seed(RANDOM_SEED)

    let game = new Game()
    game.start()

}