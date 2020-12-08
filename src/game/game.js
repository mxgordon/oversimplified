import { INVALID_MOVE } from 'boardgame.io/core';
import { Delaunay } from "d3-delaunay";
import { polygon, union } from "@turf/turf"
import { noise } from '@chriscourses/perlin-noise'
import names from '../names.json'


export const Oversimplified = {
    name: "Oversimplified",

    setup: (ctx, setupData) => {
        return setupData
    },

    moves: {
        moveTo: (G, ctx, fromID, toID, troops) => {

        },
        attackTile: (G, ctx, fromID, toID, troops) => {

        },
        buildBuilding: (G, ctx, locationID, buildingType) => {

        },
        makeTroops: (G, ctx, location, building, troopType) => {

        },
        trade: (G, ctx, withPlayer, give, receive) => {

        }
    },

    turn: {
        moveLimit: 6
    },

    endIf: (G, ctx) => {
        return false
    },

    disableUndo: true,
};

class OnlyOneConnectingPointError extends Error {
    constructor(message) {
        super(message)
        this.name = "OnlyOneConnectingPointError"
    }
}
class IsEnclaveError extends Error {
    constructor(message) {
        super(message)
        this.name = "IsEnclaveError"
    }
}
class AssertionError extends Error {
    constructor(message) {
        super(message)
        this.name = "AssertionError"
    }
}

function mapToObject(map) {
    var keys = [...map.keys()]
    var obj = {}
    for (let key of keys) {
        obj[key] = map.get(key)
    }
    return obj
}

function objectToMap(obj) {
    var keys = [...obj.keys()]
    var map = new Map()
    for (let key of keys) {
        map.set(parseInt(key), obj[key])
    }
    return map
}

export function generateGameBoard(num = 100) {
    var [width, height] = [1200, 700]
    var [mapTiles, neighborMap] = createGameBoard(num, height, width)
    return {width, height, mapTiles, neighborMap: mapToObject(neighborMap)}
}

export function createGameBoard(numPoints, height, width) {
    var mapTiles = makeAndMergeTiles(numPoints, width, height)
    var neighborMap = generateTouchMap(mapTiles);  // this semicolon is need bc javascript is stupid
    [mapTiles, neighborMap] = merge1PolyTiles(mapTiles, neighborMap)
    mapTiles = assignBiomes(mapTiles, neighborMap)
    return [mapTiles, neighborMap]
}

function assignBiomes(mapTiles, neighborMap) {
    const resources = ["coal", "iron", "lumber", "stone", "food", "oil"]
    const colorVariation = 30

    const oceanBiomes = {ocean: {chance: 100, moveability: 10, color: [30, 144, 255]}}
    const landBiomes = {
        grassland: {chance: 25, moveability: 10, color: [107, 142, 35]},
        forest: {chance: 25, moveability: 6, color: [0, 100, 0]},
        desert: {chance: 25, moveability: 7, color: [225, 169, 95]},
        mountain: {chance: 25, moveability: 3, color: [112, 128, 144]}
    }

    const tiles = mapTiles.map((_, i) => i)
    const landTiles = tiles.filter(v => !mapTiles[v].data.isOcean)
    const oceanTiles = tiles.filter(v => mapTiles[v].data.isOcean)

    while (landTiles.length > 0) {
        let current = landTiles[Math.floor(Math.random() * landTiles.length)]
        let group = neighborMap.get(current).filter(v => landTiles.includes(v))

        let baseBiome = pickBiome(landBiomes)
        let groupBiomes = group.map(v => [v, pickBiome(landBiomes, baseBiome)]).filter(v => v[1] === baseBiome)
        groupBiomes = groupBiomes.concat([[current, baseBiome]])

        for (let [i, b] of groupBiomes) {
            mapTiles[i].data = {...landBiomes[b], ...mapTiles[i].data, biome: b, color: numToHexColor(landBiomes[b].color, false, colorVariation)}
            landTiles.splice(landTiles.indexOf(i), 1)
        }
    }

    while (oceanTiles.length > 0) {
        let current = oceanTiles[Math.floor(Math.random() * oceanTiles.length)]
        let group = neighborMap.get(current).filter(v => oceanTiles.includes(v))

        let baseBiome = pickBiome(oceanBiomes)
        let groupBiomes = group.map(v => [v, pickBiome(oceanBiomes, baseBiome)]).filter(v => v[1] === baseBiome)
        groupBiomes = groupBiomes.concat([[current, baseBiome]])

        for (let [i, b] of groupBiomes) {
            mapTiles[i].data = {...oceanBiomes[b], ...mapTiles[i].data, biome: b, color: numToHexColor(oceanBiomes[b].color, false, colorVariation)};
            oceanTiles.splice(oceanTiles.indexOf(i), 1)
        }
    }

    return mapTiles
}

function pickBiome(biomes, biome50) {
    if (biome50 && biomes.length > 1) {
        biomes[biome50].chance = [...Object.entries(biomes)].filter(v => v[0] !== biome50).reduce((prev, curr) => prev +  curr[1].chance, 0)  // gives this biome a 50% chance of being picked
    }

    const maxPick = [...Object.entries(biomes)].reduce((prev, curr) => prev + curr[1].chance, 0)
    const r = Math.ceil(Math.random() * maxPick)
    var num = 0
    for (let [name, data] of Object.entries(biomes)) {
        if (num < r && r <= num + data.chance) {
            return name
        }
        num += data.chance
    }
    throw Error("pickBiome didn't pick a biome")
}

function merge1PolyTiles(mapTiles, neighborMap) { 
    var onePolyTilesIndexes = [...neighborMap.keys()].filter((v) => mapTiles[v].points.length === 1)
    var validOnePolyTiles = onePolyTilesIndexes.filter((v) => neighborMap.get(v).filter((v2) => mapTiles[v2].data.isOcean === mapTiles[v].data.isOcean).length > 0)
    var dontFit = []

    for (let polyI of validOnePolyTiles) {
        let validTouching = neighborMap.get(polyI).filter((v) => mapTiles[v].points.length !== 1).filter((v) => mapTiles[v].data.isOcean === mapTiles[polyI].data.isOcean)
        let perimeters = validTouching.map((v) => getPerimeterFromPolys(mapTiles[polyI].polygon, mapTiles[v].polygon))
        let perimeterDiffs = perimeters.map((v, i) => v - perimeter(mapTiles[validTouching[i]].polygon))
        let bestFitI = perimeterDiffs.indexOf(Math.min(...perimeterDiffs))

        if (perimeters[bestFitI] !== Number.MAX_VALUE) {
            let baseTile = mapTiles[validTouching[bestFitI]]
            let mergeTile = mapTiles[polyI]
            mapTiles[validTouching[bestFitI]] = {
                polygon: combine(baseTile.polygon, mergeTile.polygon),
                points: baseTile.points.concat(mergeTile.points),
                cellsIndex: baseTile.cellsIndex.concat(mergeTile.cellsIndex),
                touchCellsIndex: baseTile.touchCellsIndex.concat(mergeTile.touchCellsIndex),
                data: baseTile.data,
                id: baseTile.id
            }
        } else {
            dontFit.push(polyI)
        }
    }
    validOnePolyTiles = validOnePolyTiles.filter((v) => !dontFit.includes(v))
    validOnePolyTiles.sort((a, b) => b - a)

    for (let removeTile of validOnePolyTiles) {
        mapTiles.splice(removeTile, 1)
    }

    for (let removeTile of validOnePolyTiles) {
        let keys = [...neighborMap.keys()]
        keys.sort((a, b) => a - b)

        for (let key of keys) {
            if (key > removeTile) {
                neighborMap.set(key - 1, stepDown(neighborMap.get(key), removeTile))
                neighborMap.delete(key)

            } else if (key < removeTile) {
                neighborMap.set(key, stepDown(neighborMap.get(key), removeTile))
            }
        }
    }
    for (let key of neighborMap.keys()) { // clean up neighborMap
        neighborMap.set(key, [...new Set(neighborMap.get(key))])
    }
    
    mapTiles = mapTiles.map(v => ({...v, touchCellsIndex: undefined, cellsIndex: undefined}))

    return [mapTiles, neighborMap]

}

function generateTouchMap(mapTiles) {
    var neighborMap = new Map()
    var smallNeighborMap = new Map()
    for (var i = 0; i < mapTiles.length; i++) {
        for (let polyI of mapTiles[i].cellsIndex) {
            smallNeighborMap.set(polyI, i)
        }
    }

    for (i = 0; i < mapTiles.length; i++) {
        let touching = []
        for (let polyI of mapTiles[i].touchCellsIndex) {
            touching.push(smallNeighborMap.get(polyI))
        }
        neighborMap.set(i, touching)
    }
    return neighborMap
}

function makeAndMergeTiles(numPoints, width, height) {
    var points = Array(numPoints)
        .fill(0)
        .map(() => [Math.floor(Math.random() * width), Math.floor(Math.random() * height)])
        .map(JSON.stringify)
        .reverse()
        .filter((e, i, a) => a.indexOf(e, i + 1) === -1)
        .reverse()
        .map(JSON.parse)

    var voronoi = Delaunay.from(points).voronoi([0, 0, width, height])

    var polygons = [...voronoi.cellPolygons()]
    var polygonsIndex = polygons.map((v, i) => i)
    var touching = []
    var mapTiles = []
    var oceanCounter = 0

    while (polygonsIndex.length > 0) {
        if (polygonsIndex.length % 5 === 0) console.log(polygonsIndex.length)

        if (touching.length > 0) {
            var baseIndex = touching[Math.floor(Math.random() * touching.length)]
            polygonsIndex = polygonsIndex.filter((v) => v !== baseIndex)
        } else {
            var baseIndex = polygonsIndex.splice(Math.floor(Math.random() * polygonsIndex.length), 1)[0]
        }

        let polygonIndexes = [baseIndex]
        let basePolygon = polygons[baseIndex]
        let isLand = isLandPoint(points[baseIndex])
        let numPolys = Math.floor(Math.random() * (isLand ? 15 : 30)) + 8

        touching = [...voronoi.neighbors(baseIndex)].filter((value) => { return contains(polygonsIndex, value) })

        for (let nPoly = 0; nPoly < numPolys; nPoly++) {
            if (touching.length < 1) break

            let nextIndex = touching[0]
            if (touching.length > 1) {
                let nextPerimeter = getPerimeterFromPolys(basePolygon, polygons[nextIndex])
                for (let i = 1; i < Math.min(touching.length, isLand ? 3 : touching.length); i++) {
                    let tmpI = touching[i]
                    let tmpPerimeter = getPerimeterFromPolys(basePolygon, polygons[tmpI])

                    if (tmpPerimeter === Number.MAX_VALUE) {
                        touching.splice(tmpI, 1)
                        continue
                    } else if (tmpPerimeter < nextPerimeter) {
                        nextPerimeter = tmpPerimeter
                        nextIndex = tmpI
                    }
                }
            }

            touching = touching.filter((v) => v !== nextIndex)
            let nextPoly = polygons[nextIndex]

            if (isLand !== isLandPoint(points[nextIndex])) {
                nPoly--
                continue
            }

            try {
                basePolygon = combine(basePolygon, nextPoly)
                polygonIndexes.push(nextIndex)
            } catch (e) {
                if (e instanceof IsEnclaveError || e instanceof OnlyOneConnectingPointError) {
                    nPoly--
                    continue
                } else {
                    throw e
                }
            }
            polygonsIndex.splice(polygonsIndex.indexOf(nextIndex), 1)
            touching.push(...[...voronoi.neighbors(nextIndex)].filter((value) => { return contains(polygonsIndex, value) }))
        }

        mapTiles.push({
            polygon: basePolygon,
            points: polygonIndexes.map((v) => points[v]),
            cellsIndex: polygonIndexes,
            touchCellsIndex: [...new Set(polygonIndexes.map((v) => [...voronoi.neighbors(v)]).flat().filter((v) => !(polygonIndexes.includes(v))))],
            data: { 
                isOcean: !isLand, 
                color: (!isLand ? "blue" : "green"), 
                center: getMiddlestPoint(polygonIndexes.map((v) => points[v])),
                name: isLand? names.splice(Math.floor(Math.random() * names.length), 1)[0] : ("Ocean " + (oceanCounter+= 1))
            },
            id: polygonsIndex.length
        })
        
    }
    return mapTiles
}

function generateRegions(mapTiles, neighborMap) {
    var tiles = mapTiles.map((v, i) => [v,i]).filter((v) => !v[0].data.isOcean).map((v) => v[1])
    var regions = []

    while (tiles.length > 0) {
        let baseTile = tiles.splice(Math.floor(Math.random() * tiles.length), 1)[0]
        let basePoly = tiles[baseTile].polygon
        let touching = neighborMap.get(baseTile).filter((v) => tiles.includes(v))
        let numTiles = Math.floor(Math.random() * 6) + 5
        let region = {
            tiles: [baseTile],
            name: names.splice(Math.floor(Math.random() * names.length), 1)[0],
            color: numToHexColor(null, true)
        }

        for (let i = 0; i < numTiles; i++) {
            if (touching.length === 0) break
            let perimeters = touching.map((v) => getPerimeterFromPolys(basePoly, mapTiles[v].polygon))
            let smallestI = touching[perimeters.indexOf(Math.min(...perimeters))]
            if (smallestI === Number.MAX_VALUE) break

            region.tiles.push(smallestI)
            tiles.splice(tiles.indexOf(smallestI), 1)
            touching.push(...mapTiles.get(smallestI).filter((v) => !v.data.isOcean && tiles.includes(v)))
        }

        if (region.tiles.length === 1) {
            if (allIsolatedTiles(tiles, neighborMap)) {
                let annexedTiles = regions.map((v) => v.tiles).flat()

                for (let tile of tiles) {

                }
            }
        }
    }

}

// function 

function allIsolatedTiles(tiles, neighborMap) {
    for (let tile of tiles) {
        if (neighborMap.get(tile).filter((v) => tiles.includes(v)).length > 0) return false
    }
    return true
}

function isLandPoint(point) {
    return noise(point[0] / 100, point[1] / 100, 0) > 0.5
}

function getPerimeterFromPolys(poly1, poly2) {
    assertNot(poly1, undefined); assertNot(poly2, undefined)
    try {
        return assertNot(perimeter(combine(poly1, poly2)), undefined)
    } catch (e) {
        if (e instanceof IsEnclaveError || e instanceof OnlyOneConnectingPointError) {
            return Number.MAX_VALUE
        } else {
            throw e
        }
    }
}

function assertNot(val1, val2) {
    if (JSON.stringify(val1) === JSON.stringify(val2)) {
        throw new AssertionError(val1 + " == " + val2)
    } else {
        return val1
    }
}

function distance(xy1, xy2) {
    return Math.sqrt(Math.pow(xy1[0] - xy2[0], 2) + Math.pow(xy1[1] - xy2[1], 2))
}


function perimeter(poly) {
    var currentDistance = 0
    for (var i = 0; i < poly.length - 1; i++) {
        currentDistance += distance(poly[i], poly[i + 1])
    }
    return currentDistance
}

function combine(poly1, poly2) {
    if (poly1.slice().filter((v) => { return contains(poly2, v) }).length < 2) {
        throw new OnlyOneConnectingPointError()
    }
    try {
        var realPoly1 = polygon([poly1])
        var realPoly2 = polygon([poly2])
    } catch (e) {
        throw e
    }
    var uPoly = union(realPoly1, realPoly2)
    if (uPoly.geometry.coordinates.length > 1) {
        throw new IsEnclaveError()
    }
    return uPoly.geometry.coordinates[0]
}

function contains(arr, value) {
    try {
        for (var v of arr) {
            if (JSON.stringify(value) === JSON.stringify(v)) { return true }
        }
        return false
    } catch (e) {
        throw e
    }
}

function stepDown(nums, stepAt) {
    return nums.filter((v) => v !== stepAt).map((v) => v > stepAt ? --v : v)
}

function getMiddlestPoint(points) {
    points = [...points]
    let averageX = points.map((v) => v[0]).reduce((p, v) => p + v) / points.length
    let averageY = points.map((v) => v[1]).reduce((p, v) => p + v) / points.length

    points.sort((a, b) => (Math.abs(a[0] - averageX) - Math.abs(b[0] - averageX)) + (Math.abs(a[1] - averageY) - Math.abs(b[1] - averageY)))
    return points[0]
}

function numToHexColor(arr, random=false, wiggle=0) {
    if (random) {
        arr = (new Array(3)).map(Math.floor(Math.random() * 256))
    }

    arr = arr.map(v =>  clamp(v + Math.ceil((Math.random() * wiggle) - wiggle / 2), 0, 255))

    return '#' + arr.map(zeroPadHex).join("")
}

function clamp(num, min, max) {
    return Math.max(min, Math.min(max, num))
}

function zeroPadHex(num) {
    var s = num.toString(16)
    return s.length == 1? '0' + s : s 
}