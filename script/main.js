let DEBUG = false
let ZOOM = 1
let FPS = 60
let RANDOM_SEED = 42

let PI = Math.PI
let RADIANS = (PI * 2) / 360
let DEGREES = 360 / (PI * 2)

let SCREEN_SIZE = 600
let SECTOR_SIZE = 600
let SYSTEM_RATE = 0.33

let MIN_STAR_RADIUS = 20
let MAX_STAR_RADIUS = 100

let MAX_ORBIT_RADIUS = SECTOR_SIZE

let MAX_PLANETS = 6
let MIN_PLANET_RADIUS = 6
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
let MAX_GIFTS = 3

let TRAIL_LENGTH = 10
let TRAIL_TIME = 5

let SECTOR = 0
let POS = 1
let RADIUS = 2

let MOUSE_DOWN = false

let paused = false

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

let isOnScreen = (canvas, sector, pos, r) => {
    let currentSector = canvas.currentSector
    let cameraOffset = canvas.cameraOffset

    let relSector = sub(sector, currentSector)
    let relPos = add(scale(relSector, SECTOR_SIZE), pos)
    let offsetPos = add(relPos, cameraOffset)

    return (
        offsetPos[0] + r >= 0 && offsetPos[0] - r <= SCREEN_SIZE &&
        offsetPos[1] + r >= 0 && offsetPos[1] - r <= SCREEN_SIZE
    )
}

class Game {

    constructor(canvas, avatar) {
        this.frame = document.getElementById('frame')

        // setup canvas
        let el = document.getElementById('canvas')
        this.canvas = new Canvas(el, SCREEN_SIZE, SCREEN_SIZE)

        // setup galaxy
        this.galaxy = new Galaxy()

        // start at a random sector
        this.galaxy.changeSector([
            randInt(Math.random, -50, 50),
            randInt(Math.random, -50, 50)
        ])

        // create player avatar
        this.avatar = new Avatar(this.galaxy.currentSector, [SECTOR_SIZE / 2, SECTOR_SIZE / 2])
        this.galaxy.avatar = this.avatar

        // initialize timer interval (used when starting the game timer)
        this.interval = null

        // bind methods
        this.update = this.update.bind(this)
        this.adjustSize = this.adjustSize.bind(this)

        // add event handlers
        MOUSE_DOWN = false
        this.mousePos = [0, 0]

        el.addEventListener('mousedown', e => this.startMoving(e))
        document.addEventListener('mousemove', e => this.changeDirection(e, e))
        document.addEventListener('mouseup', e => this.stopMoving(e))

        el.addEventListener('touchstart', e => this.startMoving(e.touches[0]))
        document.addEventListener('touchmove', e => this.changeDirection(e, e.touches[0]))
        document.addEventListener('touchend', e => this.stopMoving(e.touches[0]))

        el.addEventListener('contextmenu', e => e.preventDefault())
        el.addEventListener('MSHoldVisual', e => e.preventDefault())

        this.adjustSize()
        window.addEventListener('resize', this.adjustSize)

        this.debounce = 0
    }

    adjustSize() {
        let bodyWidth = window.innerWidth
        let bodyHeight = window.innerHeight
        let dim = Math.min(bodyWidth, bodyHeight) - 20
        let offsetLeft = (bodyWidth - dim) / 2
        let offsetTop = (bodyHeight - dim) / 2
        this.frame.style.marginLeft = offsetLeft + 'px'
        this.frame.style.marginTop = offsetTop + 'px'
        this.frame.style.width = dim + 'px'
        this.frame.style.height = dim + 'px'
    }

    getMousePos(e) {
        let offsetX = this.frame.offsetLeft
        let offsetY = this.frame.offsetTop
        let zoomX = SCREEN_SIZE / this.frame.offsetWidth / ZOOM
        let zoomY = SCREEN_SIZE / this.frame.offsetHeight / ZOOM
        let x = (e.clientX - offsetX) * zoomX
        let y = (e.clientY - offsetY) * zoomY
        return [x, y]
    }

    startMoving(e) {
        MOUSE_DOWN = true
        let mousePos = this.getMousePos(e)

        if (this.pushGiftButton(mousePos)) this.dropGift()
        else this.changeDirection(mousePos)
    }

    stopMoving() {
        MOUSE_DOWN = false
    }

    changeDirection(e, mousePos) {
        e.preventDefault()
        if (mousePos.clientX) mousePos = this.getMousePos(mousePos)
        if (MOUSE_DOWN) this.mousePos = mousePos
    }

    pushGiftButton(mousePos) {
        if (this.debounce > 0) return

        let r = 20
        let buttons = Gift.buttons(this.galaxy)
        let buttonPushed = false

        buttons.forEach(buttonPos => {
            let diff = sub(mousePos, buttonPos)
            let sqDist = square(diff)
            if (sqDist <= r * r) {
                buttonPushed = true
                this.debounce = 60
            }
        })

        return buttonPushed
    }

    dropGift() {
        let avatar = this.galaxy.avatar
        avatar.gifts--
        let pos = add(avatar.pos, [Math.cos(avatar.angle) * avatar.r * 3, Math.sin(avatar.angle) * avatar.r * 3])
        this.galaxy.gifts.push([ avatar.sector, pos ])
        MOUSE_DOWN = false
    }

    moveAvatar() {
        // get movement direction
        // if (this.mouseDown) this.avatar.target = sub(this.mousePos, this.canvas.cameraOffset)
        // else this.avatar.target = this.avatar.pos
        if (MOUSE_DOWN) this.avatar.target = sub(this.mousePos, this.canvas.cameraOffset)

        // re-center the galaxy on whatever sector the avatar is now in
        let mx = 0
        let my = 0
        if (this.avatar.pos[0] < 0) mx = -1
        else if (this.avatar.pos[0] > SECTOR_SIZE) mx = 1
        if (this.avatar.pos[1] < 0) my = -1
        else if (this.avatar.pos[1] > SECTOR_SIZE) my = 1
        if (mx !== 0 || my !== 0) {
            let newSector = add(this.galaxy.currentSector, [mx, my])
            this.galaxy.changeSector(newSector)
            this.avatar.sector = newSector
            let posOffset = scale([mx, my], -SECTOR_SIZE)
            this.avatar.pos = add(this.avatar.pos, posOffset)
            this.avatar.target = add(this.avatar.target, posOffset)
        }

        // center camera on avatar
        this.canvas.cameraOffset = sub(this.canvas.screenCenter, this.avatar.pos)
        this.canvas.starfield1.updateOffset(this.avatar.vel[0], this.avatar.vel[1])
        this.canvas.starfield2.updateOffset(this.avatar.vel[0], this.avatar.vel[1])
        this.canvas.starfield3.updateOffset(this.avatar.vel[0], this.avatar.vel[1])
    }

    update() {
        if (!paused) {
            this.moveAvatar()

            this.canvas.update(this.galaxy)

            if (this.debounce > 0) this.debounce--

            // print sector id
            let sector = this.galaxy.currentSector

            let x = Math.abs(sector[0]).toString(36)
            if (sector[0] < 0) x = 'X' + x
            x = ('0000' + x).substr(-4)

            let y = Math.abs(sector[1]).toString(36)
            if (sector[1] < 0) y = 'X' + y
            y = ('0000' + y).substr(-4)

            this.canvas.context.font = '10px monospace'
            this.canvas.context.fillStyle = '#999'
            this.canvas.context.fillText(`${x}-${y}`, SCREEN_SIZE / 2 - 20, 30)
        }

        window.requestAnimationFrame(this.update)
    }

    start() {
        paused = false
        this.update()
    }

    stop() {
        paused = true
    }

}

class Canvas {

    constructor(el, width, height) {
        this.el = el
        this.width = width
        this.height = height
        this.el.width = width
        this.el.height = height

        this.context = this.el.getContext('2d', { alpha: false })
        this.context.lineCap = 'round'

        this.interval = null

        this.currentSector = [0, 0]

        this.cameraOffset = [
            SCREEN_SIZE / 2 - SECTOR_SIZE / 2,
            SCREEN_SIZE / 2 - SECTOR_SIZE / 2
        ]

        this.starfield1 = new Starfield(1, 40)
        this.starfield2 = new Starfield(2, 20)
        this.starfield3 = new Starfield(4, 10)
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

    offset(sector) {
        if (!sector) return [0, 0]
        let relSector = sub(sector, this.currentSector)
        let sectorPos = scale(relSector, SECTOR_SIZE)
        let offsetPos = add(sectorPos, this.cameraOffset)
        return offsetPos
    }

    drawArc(sector, pos, r, start, end, anticlockwise) {
        let offset = this.offset(sector)
        let x = offset[0] + pos[0]
        let y = offset[1] + pos[1]

        this.context.beginPath()
        this.context.arc(x, y, r, start, end, anticlockwise)
        this.context.stroke()
    }

    drawCircle(sector, pos, r, fill, noStroke) {
        let offset = this.offset(sector)
        let x = offset[0] + pos[0]
        let y = offset[1] + pos[1]

        this.context.beginPath()
        this.context.arc(x, y, r, 0, PI * 2)

        if (fill) this.context.fill()
        if (!noStroke) this.context.stroke()
    }

    drawRect(sector, pos, width, height, fill) {
        let offset = this.offset(sector)
        let x = offset[0] + pos[0]
        let y = offset[1] + pos[1]

        this.context.beginPath()
        this.context.rect(x, y, width, height)

        if (fill) this.context.fill()
        this.context.stroke()
    }

    drawLine(sector1, pos1, sector2, pos2) {
        let offset1 = this.offset(sector1)
        let x1 = offset1[0] + pos1[0]
        let y1 = offset1[1] + pos1[1]

        let offset2 = this.offset(sector2)
        let x2 = offset2[0] + pos2[0]
        let y2 = offset2[1] + pos2[1]

        this.context.beginPath()
        this.context.moveTo(x1, y1)
        this.context.lineTo(x2, y2)
        this.context.stroke()
    }

    clear() {
        this.context.clearRect(0, 0, SCREEN_SIZE, SCREEN_SIZE)
    }

    drawStarfields(galaxy) {
        this.context.fillStyle = this.starfield1.getColor(galaxy, 600, 200, 210)
        this.starfield1.draw(this.context)

        this.context.fillStyle = this.starfield2.getColor(galaxy, 500, 170, 180)
        this.starfield2.draw(this.context)

        this.context.fillStyle = this.starfield3.getColor(galaxy, 400, 150, 160)
        this.starfield3.draw(this.context)
    }

    drawFuel(galaxy) {
        let fuel = galaxy.avatar.fuel

        this.context.lineWidth = Math.max(1, (fuel - 0.75) * 20)

        let halfScreen = SCREEN_SIZE / 2
        let edgeOffset = 10
        let r = halfScreen - edgeOffset
        let startAngle = 0 - (PI / 2)
        let remainingFuel = fuel === 1 ? 1 : 1 - fuel
        let endAngle = PI * 2 * remainingFuel - (PI / 2)

        this.drawArc(null, [halfScreen, halfScreen], r, startAngle, endAngle, true)

        if (fuel <= 0) this.drawEndScreen()
    }

    drawGiftButtons(galaxy) {
        this.context.lineWidth = 1
        this.context.strokeStyle = 'black'
        this.context.fillStyle = 'white'

        let r = 20
        let buttons = Gift.buttons(galaxy)

        buttons.forEach(buttonPos => {
            this.drawCircle(null, buttonPos, r + 4, false)
            this.drawCircle(null, buttonPos, r, true)
            Gift.draw(this, galaxy, -PI / 2, null, buttonPos, -5)
        })
    }

    drawTrails(flocks, avatar) {
        let boidTrails = []
        flocks.forEach(flock => {
            flock.boids.forEach(boid => {
                if (!isOnScreen(this, boid.sector, boid.pos, flock.r * 10)) return
                boidTrails.push({
                    sector: boid.sector,
                    segments: boid.trailSegments.concat(boid.backPos)
                })
            })
        })

        boidTrails.push({
            sector: avatar.sector,
            segments: avatar.trailSegments.concat(avatar.backPos)
        })

        for(var i = 0; i < TRAIL_LENGTH; i++) {
            this.context.lineWidth = Math.min(0.1, Math.max(0.01, i * 0.05))
            boidTrails.forEach(trail => {
                let seg1 = trail.segments[i]
                let seg2 = trail.segments[i+1]
                if (seg1 && seg2) this.drawLine(seg1[0], [seg1[1], seg1[2]], seg2[0], [seg2[1], seg2[2]])
            })
        }
    }

    drawEndScreen() {
        let halfScreen = SCREEN_SIZE / 2
        this.drawCircle(null, [halfScreen, halfScreen], halfScreen, true)

        this.context.font = '24px monospace'
        this.context.fillStyle = 'white'
        this.context.fillText('you ran out of fuel', halfScreen - 120, halfScreen)
    }

    update(galaxy) {
        this.clear()
        this.currentSector = galaxy.currentSector

        // draw background
        this.context.fillStyle = '#eee'
        this.context.fillRect(0, 0, SCREEN_SIZE, SCREEN_SIZE)

        // draw starfields
        this.drawStarfields(galaxy)

        this.context.save()
        if (ZOOM !== 1) this.context.scale(ZOOM, ZOOM)

        // update and draw galaxy
        galaxy.update(this)

        this.context.restore()

        // draw UI elements
        this.drawGiftButtons(galaxy)
        this.drawFuel(galaxy)
    }

}

class Starfield {

    constructor(scale, offsetScale, width, gridSize) {
        this.scale = scale
        this.offsetScale = offsetScale
        this.gridSize = gridSize || 10
        this.width = SCREEN_SIZE / this.gridSize / this.scale
        this.offsetx = 0
        this.offsety = 0
        this.tileSize = this.width * this.gridSize * this.scale

        this.starsX = []
        this.starsY = []
        for (var x = 0; x < this.width; x++) {
            for (var y = 0; y < this.width; y++) {
                let isStar = Math.abs(noise.simplex2(x, y)) < 0.01
                if (isStar) {
                    let posx = (x + Math.random()) * this.gridSize * this.scale
                    let posy = (y + Math.random()) * this.gridSize * this.scale

                    this.starsX.push(posx)
                    this.starsY.push(posy)

                    this.starsX.push(posx - this.tileSize)
                    this.starsY.push(posy)

                    this.starsX.push(posx)
                    this.starsY.push(posy - this.tileSize)

                    this.starsX.push(posx - this.tileSize)
                    this.starsY.push(posy - this.tileSize)
                }
            }
        }

        this.numStars = this.starsX.length
    }

    getColor(galaxy, animLength, min, max) {
        let remainder = galaxy.ticks % animLength
        let animPortion = remainder / animLength
        let opacity = Math.sin(animPortion * PI * 2)

        let color = min + Math.floor(opacity * (max - min))
        let hex = color.toString(16)
        hex = ('00' + hex).substr(-2)
        return '#' + hex + hex + hex
    }

    updateOffset(x, y) {
        this.offsetx -= x / this.offsetScale
        this.offsety -= y / this.offsetScale
        if (this.offsetx > SCREEN_SIZE / 2) this.offsetx -= this.tileSize
        if (this.offsetx < -SCREEN_SIZE / 2) this.offsetx += this.tileSize
        if (this.offsety > SCREEN_SIZE / 2) this.offsety -= this.tileSize
        if (this.offsety < -SCREEN_SIZE / 2) this.offsety += this.tileSize
    }

    draw(context) {
        for (var i = 0; i < this.numStars; i++) {
            let x = this.starsX[i] + this.offsetx + SCREEN_SIZE / 2
            let y = this.starsY[i] + this.offsety + SCREEN_SIZE / 2
            context.fillRect(x, y, 1, 1)
        }
    }
}

class Galaxy {

    constructor() {
        this.currentSector = []

        this.sectors = []
        this.range = 2

        this.planetCache = {}

        this.flockCache = {}
        this.flockCacheKeys = []

        this.obstacles = []
        this.avatar = null

        this.gifts = []
        this.friends = {}

        this.ticks = 0
    }

    changeSector(newSector) {
        this.currentSector = newSector
        this.getSectors()
    }

    getSectors() {
        this.sectors = []

        for (var x = -this.range; x <= this.range; x++) {
            for (var y = -this.range; y <= this.range; y++) {
                let coords = add(this.currentSector, [x, y])
                this.sectors.push(new Sector(this, coords))
            }
        }
    }

    cacheFlock(flock, key) {
        this.flockCache[key] = flock
        this.flockCacheKeys.push(key)
    }

    flocksToUpdate() {
        let flocks = []
        this.flockCacheKeys.forEach(key => {
            let flock = this.flockCache[key]
            let nearbyBoids = false
            flock.boids.forEach(boid => {
                let avatarPos = this.avatar.absPos
                let boidPos = boid.absPos
                let dx = Math.abs(avatarPos[0] - boidPos[0]) / SECTOR_SIZE
                let dy = Math.abs(avatarPos[1] - boidPos[1]) / SECTOR_SIZE
                if (dx <= this.range || dy <= this.range) nearbyBoids = true
            })
            if (nearbyBoids) flocks.push(flock)
        })
        return flocks
    }

    update(canvas) {
        this.ticks++

        this.obstacles = [[this.avatar.sector, this.avatar.pos, this.avatar.r]]

        let stars = []
        let planets = []
        let orbits = []

        // update things
        this.sectors.forEach(sector => {

            let coords = sector.coords
            let key = stringifyCoords(coords)

            if (sector.star) {
                stars.push(sector.star)

                this.obstacles.push([coords, sector.star.pos, sector.star.r])

                sector.star.planets.forEach(planet => {
                    planets.push(planet)
                    orbits.push(planet.orbit)

                    this.obstacles.push([coords, planet.pos, planet.r])

                    if (planet.flock && !this.flockCache[planet.key]) this.cacheFlock(planet.flock, planet.key)

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

        let flocks = this.flocksToUpdate()

        // draw things
        canvas.context.strokeStyle = 'black'
        canvas.context.lineWidth = 1
        canvas.context.fillStyle = 'black'
        stars.forEach(star => star.draw(canvas, this))

        canvas.context.fillStyle = 'white'
        canvas.context.lineWidth = 0.1
        orbits.forEach(orbit => orbit.draw(canvas, this))

        if (this.gifts.length > 0) canvas.context.lineWidth = 1
        this.gifts.forEach(gift => Gift.draw(canvas, this, -PI / 2, gift[0], gift[1], -5, true))

        if (planets.length > 0) canvas.context.lineWidth = 10
        planets.forEach(planet => planet.drawBuildings(canvas, this))

        planets.forEach(planet => planet.draw(canvas, this))

        canvas.drawTrails(flocks, this.avatar)

        canvas.context.lineWidth = 1
        planets.forEach(planet => planet.drawFuel(canvas, this))
        flocks.forEach(flock => flock.draw(canvas, this))

        canvas.context.fillStyle = 'black'
        this.avatar.draw(canvas, this)
    }

}

class Sector {

    constructor(galaxy, coords, skipFlocks) {
        this.coords = coords
        let key = stringifyCoords(coords)

        // create a random seed based on the sector's coordinates -
        // this way the sector remains consistent even when offscreen,
        // without having to keep track of it in memory
        this.rng = new Math.seedrandom(`coordinates: ${coords[0]}, ${coords[1]}`)

        // some sectors have star systems
        let hasStar = Math.abs(noise.simplex2(coords[0], coords[1])) <= SYSTEM_RATE
        if (hasStar) this.star = new Star(galaxy, this.coords, this.rng)

        // some sectors have aliens
        if (!skipFlocks && hasStar && this.star.planets.length > 0) {
            let sectorHasFlock = this.rng() <= ALIEN_RATE
            let homeworldIndex = randInt(this.rng, 0, this.star.planets.length)
            this.star.planets.forEach(planet => {
                let flock = galaxy.flockCache[planet.key]
                if (flock) {
                    this.star.planets[planet.index] = flock.planet
                }
                else if (sectorHasFlock && planet.index === homeworldIndex) {
                    let newFlock = new Flock(galaxy, this.coords, this.star.planets[homeworldIndex], this.rng)
                    galaxy.cacheFlock(newFlock, planet.key)
                }
            })
        }
    }

    draw(canvas) {
        if (DEBUG) canvas.drawRect(this.coords, [0, 0], SECTOR_SIZE, SECTOR_SIZE, false)
    }

}

class Star {

    constructor(galaxy, sector, rng) {
        this.sector = sector

        this.r = randInt(rng, MIN_STAR_RADIUS, MAX_STAR_RADIUS)
        this.pos = [
            randInt(rng, this.r, SECTOR_SIZE - this.r),
            randInt(rng, this.r, SECTOR_SIZE - this.r)
        ]

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
        let timeMod = Math.sin((galaxy.ticks % rayTime) / rayTime * PI * 2)
        for (var i = 0; i < numRays; i++) {
            let angle = i * rayAngle
            let baseLength = this.r + rayLength
            let length = baseLength + (Math.sin(angle * numRays / 6) * rayLength * timeMod)
            let x = this.pos[0] + Math.cos(angle) * length
            let y = this.pos[1] + Math.sin(angle) * length
            canvas.drawLine(this.sector, this.pos, this.sector, [x, y])
        }
    }

    draw(canvas, galaxy) {
        if (!isOnScreen(canvas, this.sector, this.pos, this.r * 1.2)) return
        this.drawRays(canvas, galaxy)
        canvas.drawCircle(this.sector, this.pos, this.r, true)
    }

}

class Orbit {

    constructor(sector, pos, r) {
        this.sector = sector
        this.pos = pos
        this.r = r
    }

    draw(canvas) {
        canvas.drawCircle(this.sector, this.pos, this.r, false)
    }

}

class Planet {

    constructor(galaxy, star, index, orbitRadius, r, rng) {
        this.index = index
        this.sector = star.sector
        this.key = stringifyPlanetCoords(this.sector, index)

        this.orbit = new Orbit(this.sector, star.pos, orbitRadius)

        this.r = r
        this.startAngle = randFloat(rng, 0, PI * 2)
        this.speed = randFloat(rng, MIN_PLANET_SPEED, MAX_PLANET_SPEED)
        this.calcPos(galaxy)

        this.growsGifts = rng() <= GIFT_RATE
        this.giftRegenRate = randInt(rng, MIN_GIFT_REGEN, MAX_GIFT_REGEN)

        this.maxBuildings = Math.floor(this.r / 4)
        this.buildingAngles = []
        this.buildingHeights = []
        for (var i = 0; i < this.maxBuildings; i++) {
            let angle, similarAngles
            let uniqueAngle = false
            while (!uniqueAngle) {
                angle = randInt(rng, -PI, PI)
                similarAngles = this.buildingAngles.filter(a => Math.abs(angle - a) < PI / 9)
                if (similarAngles.length === 0) uniqueAngle = true
            }
            this.buildingAngles.push(angle)
            let maxHeight = Math.min(10, this.r / 2)
            this.buildingHeights.push(randInt(rng, -2, maxHeight))
        }
    }

    setCache(galaxy, key, value) {
        if (!galaxy.planetCache[this.key]) galaxy.planetCache[this.key] = {}
        galaxy.planetCache[this.key][key] = value
        this[key] = value
    }

    getCache(galaxy, key) {
        if (!galaxy.planetCache[planet.key]) return
        return galaxy.planetCache[planet.key][key]
    }

    addBuilding(galaxy) {
        let numBuildings = Math.min(this.maxBuildings, (this.numBuildings || 0) + 1)
        this.setCache(galaxy, 'numBuildings', numBuildings)
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

    makeHomeworld(galaxy) {
        this.setCache(galaxy, 'isHomeworld', true)
    }

    calcPos(galaxy) {
        let ticksPerRotation = (PI * 2) / this.speed
        let remainderTicks = galaxy.ticks % ticksPerRotation
        let rotationPortion = remainderTicks / ticksPerRotation
        this.angle = this.startAngle + (rotationPortion * PI * 2)
        if (this.angle > PI * 2) this.angle -= PI * 2

        let unitVector = [Math.cos(this.angle), Math.sin(this.angle)]
        let scaledVector = scale(unitVector, this.orbit.r)
        let orbitalPosition = add(scaledVector, this.orbit.pos)

        this.pos = orbitalPosition
        this.absPos = absPosition(this.sector, this.pos)
    }

    update(galaxy) {
        // move the planet along its orbital path
        this.calcPos(galaxy)

        // get cache
        let cache = galaxy.planetCache[this.key]

        // get cache values
        this.hasFuel = cache ? cache.hasFuel : false
        this.hasGift = cache ? cache.hasGift : this.growsGifts
        this.lastGiftPickup = cache ? cache.lastGiftPickup : 0
        this.isHomeworld = cache ? cache.isHomeworld : false
        this.numBuildings = cache ? cache.numBuildings : 0

        this.flock = galaxy.flockCache[this.key]
    }

    drawBuildings(canvas) {
        for (var i = 0; i < this.numBuildings; i++) {
            let angle = this.buildingAngles[i]
            let dist = this.r + this.buildingHeights[i]
            let endPos = [Math.cos(angle) * dist, Math.sin(angle) * dist]
            endPos = add(this.pos, endPos)
            canvas.drawLine(this.sector, this.pos, this.sector, endPos)
        }
    }

    drawFuel(canvas, galaxy) {
        if (!this.hasFuel || this.numBuildings === 0) return

        let animLength = 120
        let remainder = galaxy.ticks % animLength
        let animPortion = remainder / animLength
        let r = (Math.sin(animPortion * PI * 2) + 2) * GIFT_RADIUS / 2

        let index = this.numBuildings - 1
        let angle = this.buildingAngles[index]
        let dist = this.r + this.buildingHeights[index] + 10 + GIFT_RADIUS
        let pos = [Math.cos(angle) * dist, Math.sin(angle) * dist]
        pos = add(this.pos, pos)
        canvas.drawCircle(this.sector, pos, r)
    }

    drawTexture(canvas) {
        canvas.drawArc(this.sector, this.pos, this.r * 0.8 - 1, PI * 0.2, PI * 0.4)
        canvas.drawArc(this.sector, this.pos, this.r * 0.8 - 1, PI * 0.5, PI * 1.1)
        canvas.drawArc(this.sector, this.pos, this.r * 0.8 - 1, PI * 1.2, PI * 1.3)
        canvas.drawArc(this.sector, this.pos, this.r * 0.6 - 1, PI * 0.3, PI)
    }

    draw(canvas, galaxy) {
        this.update(galaxy)

        // don't update if not on screen
        if (!isOnScreen(canvas, this.sector, this.pos, this.r + GIFT_DISTANCE + GIFT_RADIUS)) return

        // regrow gifts
        if (!this.isHomeworld && this.growsGifts && galaxy.ticks > this.lastGiftPickup + this.giftRegenRate) {
            this.generateGift(galaxy)
        }

        // draw planet
        canvas.context.lineWidth = 2
        canvas.drawCircle(this.sector, this.pos, this.r, true)

        // draw texture
        canvas.context.lineWidth = 1
        this.drawTexture(canvas)

        // draw gifts
        if (this.hasGift) Gift.draw(canvas, galaxy, this.startAngle, this.sector, this.pos, this.r)
    }

}

class Ship {
    static applyForce(self, force) {
        self.acc = add(self.acc, force)
    }

    static seek(target, maxSpeed, maxForce, absPos, vel) {
        let desired = sub(target, absPos)
        desired = scale(desired, maxSpeed)
        let steer = sub(desired, vel)
        steer = limit(steer, maxForce)

        return steer
    }

    static arrive(target, distance, maxSpeed, maxForce, absPos, vel) {
        let desired = sub(target, absPos)
        let d = mag(desired)
        if (d < distance) {
            let m = mapValue(d, 0, distance, 0, maxSpeed)
            desired = scale(desired, m)
        }
        else {
            desired = scale(desired, maxSpeed)
        }
        let steer = sub(desired, vel)
        steer = limit(steer, maxForce)

        return steer
    }

    static wander(target, radius) {
        let angle = Math.random() * PI * 2
        let vector = [Math.cos(angle) * radius, Math.sin(angle) * radius]
        let goal = add(target, vector)
        return goal
    }

    static updateTrail(self) {
        self.trailTicks++
        if (self.trailTicks >= TRAIL_TIME) {
            self.trailTicks = 0
            self.trailSegments.push([self.sector, self.backPos[0], self.backPos[1]])
            if (self.trailSegments.length > TRAIL_LENGTH) self.trailSegments.shift()
        }
    }

    static draw(canvas, r, bez1, bez2, sector, pos, angle) {
        let offset = canvas.offset(sector)
        let x = offset[0] + pos[0]
        let y = offset[1] + pos[1]

        let ctx = canvas.context
        r = r * 0.75
        bez1 = scale(bez1, r)
        bez2 = scale(bez2, r)

        ctx.beginPath()
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(angle)
        ctx.moveTo(-r, 0)
        ctx.bezierCurveTo(
            bez1[0], -bez1[1],
            bez2[0], -bez2[1],
            r, 0)
        ctx.bezierCurveTo(
            bez2[0], bez2[1],
            bez1[0], bez1[1],
            -r, 0)
        ctx.fill()
        ctx.stroke()
        ctx.restore()
    }
}

class Avatar {

    constructor(sector, pos) {
        this.sector = sector
        this.pos = pos
        this.vel = [0, 0]
        this.acc = [0, 0]
        this.absPos = absPosition(sector, pos)
        this.backPos = this.pos.slice()
        this.r = 10
        this.angle = 0

        this.changeShip()

        this.maxSpeed = 5
        this.maxForce = 0.9
        this.seekDist = SECTOR_SIZE / 2

        this.target = pos
        this.gifts = 0
        this.fuel = 1

        this.giftAngle = 0

        this.trailSegments = []
        this.trailTicks = 0
    }

    changeShip() {
        this.bezPoint1 = scale(sub([Math.random(), Math.random()], [0.5, 0.5]), 2)
        this.bezPoint2 = scale(sub([Math.random(), Math.random()], [0.5, 0.5]), 2)
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
        if (!MOUSE_DOWN) this.vel = scale(this.vel, 0.9)
        this.vel = limit(add(this.vel, this.acc), this.maxSpeed)
        this.pos = add(this.pos, this.vel)
        this.acc = scale(this.acc, 0.5)
        this.absPos = absPosition(this.sector, this.pos)
        this.backPos = sub(this.pos, [Math.cos(this.angle) * this.r * 0.75, Math.sin(this.angle) * this.r * 0.75])
    }

    update(galaxy) {
        if (MOUSE_DOWN) this.seekMouse(galaxy)
        this.avoidObstacles(galaxy)

        this.updatePos()

        Ship.updateTrail(this)
    }

    draw(canvas, galaxy) {
        this.update(galaxy)

        let offset = canvas.offset(this.sector)
        let x = offset[0] + this.pos[0]
        let y = offset[1] + this.pos[1]

        if (Math.abs(this.vel[0]) > 0 || Math.abs(this.vel[1]) > 0) {
            this.angle = Math.atan2(this.vel[1], this.vel[0])
        }

        Ship.draw(canvas, this.r * 1.5, this.bezPoint1, this.bezPoint2, this.sector, this.pos, this.angle)
    }

}

class Boid {

    constructor(index, flock, sector, rng) {
        this.index = index
        this.flock = flock
        this.rng = rng

        this.sector = sector

        let angle = randFloat(Math.random, 0, PI * 2)
        let dist = randFloat(Math.random, this.flock.r, SECTOR_SIZE / 2)
        let relPos = [Math.cos(angle) * dist, Math.sin(angle) * dist]
        this.pos = add(this.flock.planet.pos, relPos)
        if (this.pos[0] < 0) this.pos[0] = 0
        if (this.pos[1] < 0) this.pos[1] = 0
        if (this.pos[0] > SECTOR_SIZE) this.pos[0] = SECTOR_SIZE
        if (this.pos[1] > SECTOR_SIZE) this.pos[1] = SECTOR_SIZE

        this.absPos = absPosition(this.sector, this.pos)
        this.vel = [0, 0]
        this.acc = [0, 0]
        this.angle = 0
        this.backPos = this.pos.slice()

        this.isCurious = rng() <= flock.curiousRate
        this.hasGift = false

        this.sightDist = this.isCurious ? flock.sightDist * 2 : flock.sightDist
        this.sightSquared = this.sightDist * this.sightDist

        this.trailSegments = []
        this.trailTicks = 0
    }

    applyForce(force) {
        Ship.applyForce(this, force)
    }

    seek(target) {
        return Ship.seek(target, this.flock.maxSpeed, this.flock.maxForce, this.absPos, this.vel)
    }

    arrive(target, distance) {
        return Ship.arrive(target, distance, this.flock.maxSpeed, this.flock.maxForce, this.absPos, this.vel)
    }

    wander(target, radius) {
        return Ship.wander(target, radius)
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
                giftForce = scale(giftForce, this.flock.giftForce)
                if (this.isCurious) giftForce = scale(giftForce, 2)
                this.applyForce(giftForce)
            }

            // pick up gifts when you hit them
            let touchDist = GIFT_RADIUS + this.flock.r
            if (square(diff) < touchDist * touchDist) {
                // if (this.flock.giftsCollected >= this.flock.giftsNeeded) {
                //     console.log('splinter!!')
                //     let planet = this.flock.findNewHomeworld(galaxy)
                //     let newFlock = new Flock(galaxy, planet.sector, planet, this.rng, this.flock)
                //     galaxy.cacheFlock(newFlock, planet.key)
                //     console.log('new planet', planet.isHomeworld)
                // }
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
        let diff = sub(this.flock.planet.absPos, this.absPos)
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
        if (this.isCurious || this.flock.giftsCollected > 0) avatarForce = this.flock.friendForce
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
        this.acc = scale(this.acc, this.flock.friction)
        this.backPos = sub(this.pos, [Math.cos(this.angle) * this.flock.r * 0.75, Math.sin(this.angle) * this.flock.r * 0.75])
    }

    update(galaxy) {
        this.flocking()
        this.avoidObstacles(galaxy)
        this.handleGifts(galaxy)
        this.returnHome()
        this.approachAvatar(galaxy)
        this.wanderRandomly()

        this.updatePos()

        Ship.updateTrail(this)
    }

    drawGift(canvas, galaxy) {
        let relPos = [
            Math.cos(this.angle) * (this.flock.r + GIFT_DISTANCE),
            Math.sin(this.angle) * (this.flock.r + GIFT_DISTANCE)
        ]
        let giftPos = add(this.pos, relPos)
        canvas.drawCircle(this.sector, giftPos, 6, true, true)
        canvas.drawCircle(this.sector, giftPos, 3, false)
    }

    draw(canvas, galaxy) {
        this.update(galaxy)
        if (!isOnScreen(canvas, this.sector, this.pos, this.flock.r * 2)) return

        this.angle = Math.atan2(this.vel[1], this.vel[0])
        Ship.draw(canvas, this.flock.r, this.flock.bezPoint1, this.flock.bezPoint2, this.sector, this.pos, this.angle)

        if (this.hasGift) this.drawGift(canvas, galaxy)
    }

}

class Flock {

    constructor(galaxy, sector, planet, rng, clone) {
        this.sector = sector
        this.planet = planet
        planet.makeHomeworld(galaxy)
        clone = clone || {}

        let isWeird = rng() < 0.01
        let weirdness = isWeird ? randInt(rng, 0, 2) : -1
        let isHuge = weirdness === 0
        let isTiny = weirdness === 1

        if (isHuge) this.r = randFloat(rng, 50, 100)
        else if (isTiny) this.r = randFloat(rng, 2, 5)
        else this.r = randFloat(rng, 10, 20)

        if (clone.r) this.r = clone.r

        this.maxSpeed = clone.maxSpeed || randFloat(rng, 0.1, 3)
        this.maxForce = clone.maxForce || randFloat(rng, 0.05, 0.1)

        this.sightDist = clone.sightDist || randInt(rng, 50, SECTOR_SIZE / 2)
        this.sightSquared = clone.sightSquared || this.sightDist * this.sightDist

        this.aliForce = clone.aliForce || randFloat(rng, 0, 1.0)
        this.cohForce = clone.cohForce || randFloat(rng, 0, 1.0)
        this.sepForce = -2.0

        this.exploreForce = clone.exploreForce || randFloat(rng, 1, 10)
        this.avatarForce = clone.avatarForce || randFloat(rng, -1, 0.5)
        this.friendForce = clone.friendForce || randFloat(rng, Math.max(0, this.avatarForce), 1)
        this.curiousRate = clone.curiousRate || randFloat(rng, 0, 0.1)

        this.friction = clone.friction || randFloat(rng, 0, 0.5)

        this.giftsCollected = 0
        this.giftsNeeded = 3
        this.giftForce = 1
        this.hasGift = false

        this.bezPoint1 = clone.bezPoint1 || scale(sub([rng(), rng()], [0.5, 0.5]), 2)
        this.bezPoint2 = clone.bezPoint2 || scale(sub([rng(), rng()], [0.5, 0.5]), 2)

        let numBoids = isHuge ? randInt(rng, 1, 11) : randInt(rng, 1, 21) // fewer boids if huge
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
        galaxy.friends[stringifyCoords(this.sector)] = true
        this.planet.generateFuel(galaxy)
        this.planet.addBuilding(galaxy, this.giftsNeeded)
        this.giftsCollected++
    }

    findNewHomeworld(galaxy) {
        let newHomeworld = null
        let range = 1
        let sectorsChecked = {}
        let x, y, planets
        while (!newHomeworld) {
            planets = []

            // find habitable planets
            for (x = -range; x <= range; x++) {
                for (y = -range; y <= range; y++) {
                    let coords = add(this.sector, [x, y])

                    // only check sectors we haven't searched before
                    let key = stringifyCoords(coords)
                    if (sectorsChecked[key]) return
                    sectorsChecked[key] = true

                    // look up sector
                    let sector = new Sector(galaxy, coords, true)
                    let sectorPlanets = sector.star ? sector.star.planets : []

                    // find planets that aren't homeworlds or gift-producing
                    sectorPlanets.forEach(planet => {
                        let isHomeworld = planet.isHomeworld
                        let isGiftProducing = planet.growsGifts
                        if (!isHomeworld && !isGiftProducing) planets.push(planet)
                    })
                }
            }

            // pick a random planet to be the new homeworld
            if (planets.length > 0) {
                let index = randInt(Math.random, 0, planets.length)
                newHomeworld = planets[index]
            }

            // if no planets found, check again but further out
            range++
        }
        return newHomeworld
    }

    draw(canvas, galaxy) {
        this.boids.forEach(boid => boid.draw(canvas, galaxy))
    }

}

class Gift {

    static draw(canvas, galaxy, baseAngle, sector, pos, r, bubble) {
        if (typeof r === 'undefined') r = 0

        let animLength = 120
        let remainder = galaxy.ticks % animLength
        let animPortion = remainder / animLength
        let stemAngle = baseAngle + Math.sin(animPortion * PI * 2) * (PI / 24)

        let basePoint = [
            pos[0] + Math.cos(baseAngle) * r,
            pos[1] + Math.sin(baseAngle) * r
        ]

        if (bubble) {
            canvas.drawCircle(sector, [pos[0], pos[1] - 1], 12, true, true)
        }

        let stemLength = 10
        let stem = [
            basePoint[0] + Math.cos(stemAngle) * stemLength,
            basePoint[1] + Math.sin(stemAngle) * stemLength
        ]

        let leafAngle = (PI / 4) + Math.cos(animPortion * PI * 2) * (PI / 24)
        let leafLength = stemLength * 0.9
        let leaf1 = [
            basePoint[0] + Math.cos(stemAngle + leafAngle) * leafLength,
            basePoint[1] + Math.sin(stemAngle + leafAngle) * leafLength
        ]
        let leaf2 = [
            basePoint[0] + Math.cos(stemAngle - leafAngle) * leafLength,
            basePoint[1] + Math.sin(stemAngle - leafAngle) * leafLength
        ]

        canvas.drawLine(sector, basePoint, sector, stem)
        canvas.drawLine(sector, basePoint, sector, leaf1)
        canvas.drawLine(sector, basePoint, sector, leaf2)
        canvas.drawCircle(sector, stem, 0.5)
        canvas.drawCircle(sector, stem, 1)
        canvas.drawCircle(sector, stem, 1.5)
    }

    static buttons(galaxy) {
        let giftButtons = []

        let numGifts = galaxy.avatar.gifts
        let halfScreen = SCREEN_SIZE / 2
        let r = 20
        let dist = halfScreen - r - 30

        let angles = []
        if (numGifts === 1) angles = [PI / 2]
        if (numGifts === 2) angles = [PI / 2 - PI / 24, PI / 2 + PI / 24]
        if (numGifts === 3) angles = [PI / 2 - PI / 12, PI / 2, PI / 2 + PI / 12]

        for (var i = 0; i < numGifts; i++) {
            let angle = angles[i]
            let pos = [
                halfScreen + Math.cos(angle) * dist,
                halfScreen + Math.sin(angle) * dist
            ]
            giftButtons.push(pos)
        }

        return giftButtons
    }

}

window.onload = () => {

    noise.seed(RANDOM_SEED)

    window.game = new Game()
    window.game.start()

    window.ontouchmove = (e) => e.preventDefault()

}