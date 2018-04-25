let DEBUG = true
const FPS = 60
const SCREEN_WIDTH = 512
const SCREEN_HEIGHT = 512
const SECTOR_WIDTH = 512
const SECTOR_HEIGHT = 512
const MIN_STAR_RADIUS = SECTOR_WIDTH * 0.01
const MAX_STAR_RADIUS = SECTOR_WIDTH * 0.1
const MAX_PLANETS = 6
const MIN_PLANET_RADIUS = MIN_STAR_RADIUS / 10
const MAX_PLANET_RADIUS = MAX_STAR_RADIUS / 4
const MIN_PLANET_SEPARATION = (MAX_PLANET_RADIUS - MIN_PLANET_RADIUS) / 2
const NEXT_PLANET_POWER = 1.5
const MIN_PLANET_SPEED = Math.PI / 3600
const MAX_PLANET_SPEED = Math.PI / 360

const randFloat = (rng, min, max) => {
    return rng() * (max - min) + min
}

const randInt = (rng, min, max) => {
    return Math.floor(rng() * (max - min) + min)
}

class Game {

    constructor(canvas, avatar) {

        // setup canvas
        this.canvas = new Canvas(document.getElementById('canvas'), SCREEN_WIDTH, SCREEN_HEIGHT)
        this.canvas.background = new RectShape(0, 0, SECTOR_WIDTH, SECTOR_HEIGHT, 'black')

        // start at a random point in the middle of the galaxy
        this.galaxy = new Galaxy(randInt(Math.random, -100, 100), randInt(Math.random, -100, 100))

        // create player avatar
        this.avatar = new CircleShape(SECTOR_WIDTH / 2, SECTOR_HEIGHT / 2, 5, 'white')

        // initialize timer interval (used when starting the game timer)
        this.interval = null

        // add event handlers
        document.addEventListener('keydown', this.moveAvatar.bind(this))

    }

    moveAvatar(e) {
        // check for movement direction
        if (e.key === 'ArrowUp') {
            this.avatar.moveTo(this.avatar.x, this.avatar.y - 10)
            this.canvas.dy += 10
        }
        else if (e.key === 'ArrowDown') {
            this.avatar.moveTo(this.avatar.x, this.avatar.y + 10)
            this.canvas.dy -= 10
        }
        else if (e.key === 'ArrowLeft') {
            this.avatar.moveTo(this.avatar.x - 10, this.avatar.y)
            this.canvas.dx += 10
        }
        else if (e.key === 'ArrowRight') {
            this.avatar.moveTo(this.avatar.x + 10, this.avatar.y)
            this.canvas.dx -= 10
        }

        // re-center the galaxy on whatever sector the avatar is now in
        if (this.avatar.x < 0) {
            this.galaxy.shiftWest()
            this.avatar.x += SECTOR_WIDTH
            this.canvas.dx -= SECTOR_WIDTH
        }
        else if (this.avatar.x > SECTOR_WIDTH) {
            this.galaxy.shiftEast()
            this.avatar.x -= SECTOR_WIDTH
            this.canvas.dx += SECTOR_WIDTH
        }

        if (this.avatar.y < 0) {
            this.galaxy.shiftNorth()
            this.avatar.y += SECTOR_HEIGHT
            this.canvas.dy -= SECTOR_HEIGHT
        }
        else if (this.avatar.y > SECTOR_HEIGHT) {
            this.galaxy.shiftSouth()
            this.avatar.y -= SECTOR_HEIGHT
            this.canvas.dy += SECTOR_HEIGHT
        }
    }

    update() {
        this.canvas.update([this.galaxy, this.avatar])

        if (DEBUG) {
            this.canvas.context.font = '12px sans-serif'
            this.canvas.context.fillStyle = 'white'
            this.canvas.context.fillText(`${this.galaxy.x}, ${this.galaxy.y}`, 10, 22)
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
        this.children = []
        this.interval = null
        this.background = null
        this.dx = SCREEN_WIDTH / 2 - SECTOR_WIDTH / 2
        this.dy = SCREEN_HEIGHT / 2 - SECTOR_HEIGHT / 2
    }

    clear() {
        this.context.clearRect(0, 0, this.width, this.height)
    }

    update(children) {
        this.clear()

        if (this.background && this.background.update) this.background.update(this.context, 0, 0)

        children.forEach(child => {
            if (child && child.update) child.update(this.context, this.dx, this.dy)
        })
    }

}

class RectShape {

    constructor(x, y, w, h, color, isStroke) {
        this.x = x
        this.y = y
        this.w = w
        this.h = h
        this.color = color
        this.isStroke = isStroke
    }

    moveTo(x, y) {
        this.x = x
        this.y = y
    }

    update(context, dx, dy) {
        context.beginPath()
        context.rect(this.x + dx, this.y + dy, this.w, this.h)
        if (this.isStroke) {
            context.strokeStyle = this.color
            context.stroke()
        }
        else {
            context.fillStyle = this.color
            context.fill()
        }
    }

}

class CircleShape {

    constructor(x, y, r, color, isStroke) {
        this.x = x
        this.y = y
        this.r = r
        this.color = color
        this.isStroke = isStroke
    }

    moveTo(x, y) {
        this.x = x
        this.y = y
    }

    update(context, dx, dy) {
        context.beginPath()
        context.arc(this.x + dx, this.y + dy, this.r, 0, Math.PI * 2)
        if (this.isStroke) {
            context.strokeStyle = this.color
            context.stroke()
        }
        else {
            context.fillStyle = this.color
            context.fill()
        }
    }

}

class Galaxy {

    constructor(x, y) {
        // coordinates of galaxy center
        this.x = x
        this.y = y

        // set up sectors that are immediate neighbors of galaxy center
        this.sectors = {
            'NW': new Sector(x - 1, y - 1),
            'NC': new Sector(x, y - 1),
            'NE': new Sector(x + 1, y - 1),
            'CW': new Sector(x - 1, y),
            'CC': new Sector(x, y),
            'CE': new Sector(x + 1, y),
            'SW': new Sector(x - 1, y + 1),
            'SC': new Sector(x, y + 1),
            'SE': new Sector(x + 1, y + 1)
        }
    }

    shiftNorth() {
        this.y -= 1
        const newSectors = {
            'NW': new Sector(this.x - 1, this.y - 1),
            'NC': new Sector(this.x, this.y - 1),
            'NE': new Sector(this.x + 1, this.y - 1),
            'CW': this.sectors.NW,
            'CC': this.sectors.NC,
            'CE': this.sectors.NE,
            'SW': this.sectors.CW,
            'SC': this.sectors.CC,
            'SE': this.sectors.CE
        }
        this.sectors = newSectors
    }

    shiftSouth() {
        this.y += 1
        const newSectors = {
            'NW': this.sectors.CW,
            'NC': this.sectors.CC,
            'NE': this.sectors.CE,
            'CW': this.sectors.SW,
            'CC': this.sectors.SC,
            'CE': this.sectors.SE,
            'SW': new Sector(this.x - 1, this.y + 1),
            'SC': new Sector(this.x, this.y + 1),
            'SE': new Sector(this.x + 1, this.y + 1)
        }
        this.sectors = newSectors
    }

    shiftWest() {
        this.x -= 1
        const newSectors = {
            'NW': new Sector(this.x - 1, this.y - 1),
            'NC': this.sectors.NW,
            'NE': this.sectors.NC,
            'CW': new Sector(this.x - 1),
            'CC': this.sectors.CW,
            'CE': this.sectors.CC,
            'SW': new Sector(this.x - 1, this.y + 1),
            'SC': this.sectors.SW,
            'SE': this.sectors.SC
        }
        this.sectors = newSectors
    }

    shiftEast() {
        this.x += 1
        const newSectors = {
            'NW': this.sectors.NC,
            'NC': this.sectors.NE,
            'NE': new Sector(this.x + 1, this.y - 1),
            'CW': this.sectors.CC,
            'CC': this.sectors.CE,
            'CE': new Sector(this.x + 1),
            'SW': this.sectors.SC,
            'SC': this.sectors.SE,
            'SE': new Sector(this.x + 1, this.y + 1)
        }
        this.sectors = newSectors
    }

    update(context, dx, dy) {
        // update all the sectors, giving them appropriate draw offsets
        this.sectors.NW.update(context, dx - SECTOR_WIDTH, dy - SECTOR_HEIGHT)
        this.sectors.NC.update(context, dx, dy - SECTOR_HEIGHT)
        this.sectors.NE.update(context, dx + SECTOR_WIDTH, dy - SECTOR_HEIGHT)
        this.sectors.CW.update(context, dx - SECTOR_WIDTH, dy)
        this.sectors.CC.update(context, dx, dy)
        this.sectors.CE.update(context, dx + SECTOR_WIDTH, dy)
        this.sectors.SW.update(context, dx - SECTOR_WIDTH, dy + SECTOR_HEIGHT)
        this.sectors.SC.update(context, dx, dy + SECTOR_HEIGHT)
        this.sectors.SE.update(context, dx + SECTOR_WIDTH, dy + SECTOR_HEIGHT)
    }

}

class Sector {

    constructor(x, y) {
        this.x = x
        this.y = y

        // create a random seed based on the sector's coordinates -
        // this way the sector remains consistent even when offscreen,
        // without having to keep track of it in memory
        this.rng = new Math.seedrandom('coordinates' + x + '-' + y)

        // some sectors have star systems
        const hasStar = noise.simplex2(x, y) > 0
        if (hasStar) this.star = new Star(x, y, this.rng)

        // temp debug thing to show edges of sector
        this.shape = new RectShape(0, 0, SECTOR_WIDTH, SECTOR_HEIGHT, '#ccc', true)
    }

    update(context, dx, dy) {
        if (DEBUG) this.shape.update(context, dx, dy)
        if (this.star) this.star.update(context, dx, dy)
    }

}

class Star {

    constructor(coordX, coordY, rng) {
        this.x = randInt(rng, 0, SECTOR_WIDTH)
        this.y = randInt(rng, 0, SECTOR_HEIGHT)
        this.r = randInt(rng, MIN_STAR_RADIUS, MAX_STAR_RADIUS)
        this.shape = new CircleShape(this.x, this.y, this.r, 'hotpink')

        // give the star a bunch of orbiting planets, spaced out somewhat
        const numPlanets = randInt(rng, 0, MAX_PLANETS + 1)
        this.planets = []
        let orbitRadius = this.r
        for (var i = 0; i < numPlanets; i++) {
            orbitRadius += randInt(rng, MIN_PLANET_SEPARATION, MIN_PLANET_SEPARATION * Math.pow(i + 1, NEXT_PLANET_POWER))
            this.planets.push(new Planet(this.x, this.y, orbitRadius, rng))
        }
    }

    update(context, dx, dy) {
        this.shape.update(context, dx, dy)
        this.planets.forEach(planet => planet.update(context, dx, dy))
    }

}

class Planet {

    constructor(orbitX, orbitY, orbitRadius, rng) {
        this.angle = randFloat(rng, 0, Math.PI * 2)
        this.speed = randFloat(rng, MIN_PLANET_SPEED, MAX_PLANET_SPEED)
        this.orbitX = orbitX
        this.orbitY = orbitY
        this.orbitRadius = orbitRadius
        this.r = randInt(rng, MIN_PLANET_RADIUS, MAX_PLANET_RADIUS)
        this.shape = new CircleShape(0, 0, this.r, 'pink')
        this.orbitShape = new CircleShape(orbitX, orbitY, orbitRadius, 'pink', true)
        this.updatePosition()
    }

    updatePosition() {
        this.x = this.orbitX + Math.sin(this.angle) * this.orbitRadius
        this.y = this.orbitY +  Math.cos(this.angle) * this.orbitRadius
        this.shape.moveTo(this.x, this.y)
    }

    update(context, dx, dy) {
        // move the planet along its orbital path
        this.angle += this.speed
        if (this.angle > Math.PI * 2) this.angle -= Math.PI * 2
        this.updatePosition()

        this.orbitShape.update(context, dx, dy)
        this.shape.update(context, dx, dy)
    }

}

window.onload = () => {

    noise.seed(42)

    const game = new Game()
    game.start()

}