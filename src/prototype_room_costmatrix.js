'use strict';

/**
 * updateCostMatrixFromPositions
 *
 * @param {object} room
 * @param {object} costMatrix
 */
function updateCostMatrixFromPositions(room, costMatrix) {
  for (const positionType of Object.keys(room.data.positions)) {
    if (positionType === 'pathEndLevel' || positionType === 'version') {
      continue;
    }
    for (const type of Object.keys(room.data.positions[positionType])) {
      // TODO Maybe store these somewhere else
      if (positionType === 'pathEnd') {
        continue;
      }
      if (positionType === 'pathEndLevel') {
        continue;
      }
      if (positionType === 'version') {
        continue;
      }
      for (let i = 0; i<room.data.positions[positionType][type].length; i++) {
        const pos = room.data.positions[positionType][type][i];
        if (!pos) {
          room.log(`No pos for positionType: ${positionType} type: ${type} i: ${i}`);
          continue;
        }
        if (positionType !== 'structure' || i < CONTROLLER_STRUCTURES[type][room.controller.level]) {
          room.debugLog('baseBuilding', `updateCostMatrix ${positionType} ${type} ${pos.x},${pos.y} ${i} ${config.layout[`${positionType}Avoid`]}`);
          room.increaseCostMatrixValue(costMatrix, pos, config.layout[`${positionType}Avoid`]);
        }
      }
    }
  }
}

Room.prototype.updateCostMatrix = function() {
  const costMatrix = this.getCostMatrix();

  updateCostMatrixFromPositions(this, costMatrix);

  if (this.memory.walls) {
    for (const layer of Object.keys(this.memory.walls.layer)) {
      for (const wall of this.memory.walls.layer[layer]) {
        if (this.memory.walls.ramparts.indexOf(wall) < 0) {
          this.increaseCostMatrixValue(costMatrix, wall, 0xFF);
        }
      }
    }
  }

  for (const pathName of Object.keys(this.memory.routing || {})) {
    const path = this.getMemoryPath(pathName);
    this.setCostMatrixPath(costMatrix, path);
  }

  if (this.memory.misplacedSpawn) {
    const structures = this.findPropertyFilter(FIND_STRUCTURES, 'structureType', [STRUCTURE_SPAWN]);
    this.setCostMatrixStructures(costMatrix, structures, config.layout.structureAvoid);
  }

  this.setMemoryCostMatrix(costMatrix);
};

Room.prototype.setCostMatrixStructures = function(costMatrix, structures, value) {
  for (const structure of structures) {
    costMatrix.set(structure.pos.x, structure.pos.y, value);
  }
};

Room.prototype.getBasicCostMatrixCallback = function(withinRoom = false) {
  const callbackInner = (roomName) => {
    const room = Game.rooms[roomName];
    if (!room) {
      return new PathFinder.CostMatrix;
    }
    if (!room.data.costMatrix) {
      room.debugLog('routing', `getBasicCostMatrixCallback - no costmatrix`);
      room.updatePosition();
      // I think updatePosition sets the correct costmatrix
      // room.updateCostMatrix();
    }

    if (withinRoom) {
      const costMatrix = room.data.costMatrix.clone();
      const closeExits = function(x, y) {
        costMatrix.set(x, y, 0xff);
      };
      for (let i = 0; i < 50; i++) {
        closeExits(i, 0);
        closeExits(i, 49);
        closeExits(0, i);
        closeExits(49, i);
      }
      return costMatrix;
    }
    return room.data.costMatrix;
  };
  return callbackInner;
};

Room.prototype.getCostMatrixCallback = function(end, excludeStructures, oneRoom, allowExits) {
  // console.log(`getCostMatrixCallback(${end}, ${excludeStructures}, ${oneRoom}, ${allowExits})`);
  const callbackInner = (roomName, debug) => {
    // TODO How often is this called? Do we need it? Can we just use the room costMatrix?
    if (oneRoom && roomName !== this.name) {
      return false;
    }
    const room = Game.rooms[roomName];
    if (!room) {
      return new PathFinder.CostMatrix;
    }
    if (!room.data.costMatrix) {
      room.debugLog('routing', `getCostMatrixCallback - no costmatrix`);
      room.updatePosition();
      // I think updatePosition sets the correct costmatrix
      // room.updateCostMatrix();
    }
    const costMatrix = room.data.costMatrix.clone();
    // TODO the ramparts could be within existing walls (at least when converging to the newmovesim
    if (end) {
      costMatrix.set(end.x, end.y, 0);
    }

    if (excludeStructures) {
      // TODO excluding structures, for the case where the spawn is in the wrong spot (I guess this can be handled better)
      const structures = room.findPropertyFilter(FIND_STRUCTURES, 'structureType', [STRUCTURE_RAMPART, STRUCTURE_ROAD, STRUCTURE_CONTAINER], {inverse: true});
      if (debug) {
        console.log(`Exclude structures: ${JSON.stringify(structures)}`);
      }
      this.setCostMatrixStructures(costMatrix, structures, config.layout.structureAvoid);

      // TODO repairer got stuck at walls, why?
      const constructionSites = room.findPropertyFilter(FIND_CONSTRUCTION_SITES, 'structureType', [STRUCTURE_RAMPART, STRUCTURE_ROAD, STRUCTURE_CONTAINER], {inverse: true});
      this.setCostMatrixStructures(costMatrix, constructionSites, config.layout.structureAvoid);
    }

    if (allowExits) {
      const openExits = function(x, y) {
        costMatrix.set(x, y, new RoomPosition(x, y, room.name).lookFor(LOOK_TERRAIN)[0] === 'wall' ? 0xff : 0);
      };
      for (let i = 0; i < 50; i++) {
        openExits(i, 0);
        openExits(i, 49);
        openExits(0, i);
        openExits(49, i);
      }
    } else {
      const closeExits = function(x, y) {
        costMatrix.set(x, y, 0xff);
      };
      for (let i = 0; i < 50; i++) {
        closeExits(i, 0);
        closeExits(i, 49);
        closeExits(0, i);
        closeExits(49, i);
      }
    }
    return costMatrix;
  };
  return callbackInner;
};

Room.prototype.setCostMatrixPath = function(costMatrix, path) {
  for (let i = 0; i < path.length - 1; i++) {
    const pos = path[i];
    costMatrix.set(pos.x, pos.y, config.layout.pathAvoid);
  }
};

Room.prototype.increaseCostMatrixValue = function(costMatrix, pos, value) {
  costMatrix.set(pos.x, pos.y, Math.max(costMatrix.get(pos.x, pos.y), value));
};

Room.prototype.setCostMatrixAvoidSources = function(costMatrix) {
  const sources = this.findSources();
  for (const source of sources) {
    for (const pos of source.pos.getAllPositionsInRange(3)) {
      // if (!pos.inPath()) {
      this.increaseCostMatrixValue(costMatrix, pos, config.layout.sourceAvoid);
      // }
    }
  }
  return sources;
};

Room.prototype.getCostMatrix = function() {
  const costMatrix = new PathFinder.CostMatrix();
  // Keep distance to walls
  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      const roomPos = new RoomPosition(x, y, this.name);
      if (roomPos.checkForWall()) {
        costMatrix.set(roomPos.x, roomPos.y, 0xFF);
        for (const pos of roomPos.getAllPositionsInRange(1)) {
          this.increaseCostMatrixValue(costMatrix, pos, config.layout.wallAvoid);
        }
      } else {
        this.increaseCostMatrixValue(costMatrix, roomPos, config.layout.plainAvoid);
      }
    }
  }

  this.setCostMatrixAvoidSources(costMatrix);

  const lairs = this.find(FIND_STRUCTURES, {filter: {structureType: STRUCTURE_KEEPER_LAIR}});
  if (lairs.length > 0) {
    const minerals = this.findMinerals();
    const sources = this.findSources();
    for (const obj of [...lairs, ...sources, ...minerals]) {
      for (const pos of obj.pos.getAllPositionsInRange(config.layout.skLairAvoidRadius)) {
        this.increaseCostMatrixValue(costMatrix, pos, config.layout.skLairAvoid);
      }
    }
  }

  for (let i = 0; i < 50; i++) {
    costMatrix.set(i, 0, Math.max(costMatrix.get(i, 0), 0xFF));
    costMatrix.set(i, 49, Math.max(costMatrix.get(i, 49), 0xFF));
    costMatrix.set(0, i, Math.max(costMatrix.get(0, i), 0xFF));
    costMatrix.set(49, i, Math.max(costMatrix.get(49, i), 0xFF));

    const value = config.layout.borderAvoid;
    for (let j = 1; j < 5; j++) {
      costMatrix.set(i, 0 + j, Math.max(costMatrix.get(i, 0 + j), value));
      costMatrix.set(i, 49 - j, Math.max(costMatrix.get(i, 49 - j), value));
      costMatrix.set(0 + j, i, Math.max(costMatrix.get(0 + j, i), value));
      costMatrix.set(49 - j, i, Math.max(costMatrix.get(49 - j, i), value));
    }
  }

  return costMatrix;
};
