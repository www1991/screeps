'use strict';

const {findRoomsWithinReach} = require('./helper_findMyRooms');

/**
 * isClaimableRoom - Checks if a room is claimable
 * - not already claimed
 * - has a controller
 * - has at least two sources
 * - is not `Occupied`
 * - is not `Reserved`
 *
 * @param {string} roomName - The room to check
 * @return {boolean} - If the room is claimable
 **/
function isClaimableRoom(roomName) {
  const data = global.data.rooms[roomName];
  if (Memory.myRooms.indexOf(roomName) >= 0) {
    return false;
  }
  if (!data.controllerId) {
    return false;
  }
  if (data.sources < 2) {
    return false;
  }
  if (data.state === 'Occupied') {
    return false;
  }
  if (data.state === 'Controlled') {
    return false;
  }
  if (data.state === 'HostileReserved') {
    return false;
  }
  return true;
}

/**
 * getMinLinearDistancetoMyRooms
 *
 * @param {string} roomName
 * @return {number}
 */
function getMinLinearDistancetoMyRooms(roomName) {
  let minDistance = config.nextRoom.maxDistance;
  for (const myRoom of Memory.myRooms) {
    const distance = Game.map.getRoomLinearDistance(roomName, myRoom);
    minDistance = Math.min(distance, minDistance);
  }
  return minDistance;
}

/**
 * getNextRoomValuatedRoomMap - Evaluates rooms based on mineral and distance
 * and sort based on the value
 *
 * @param {array} rooms
 * @return {array}
 */
function getNextRoomValuatedRoomMap(rooms) {
  const mineralValues = JSON.parse(JSON.stringify(config.nextRoom.mineralValues));
  for (const roomName of Memory.myRooms) {
    mineralValues[global.data.rooms[roomName].mineral] /= 2;
  }
  const evaluatedRooms = rooms.map((roomName) => {
    return {
      value: getMinLinearDistancetoMyRooms(roomName) + mineralValues[global.data.rooms[roomName].mineral],
      roomName: roomName,
    };
  });
  evaluatedRooms.sort((a, b) => b.value - a.value);
  return evaluatedRooms;
}

brain.handleNextroom = function() {
  if (!Memory.myRooms) {
    return;
  }

  if (Memory.myRooms.length >= Game.gcl.level) {
    return;
  }

  if (Memory.myRooms.length >= config.nextRoom.maxRooms) {
    return;
  }

  if ((Memory.myRooms.length + 1) * config.nextRoom.cpuPerRoom >= Game.cpu.limit) {
    return;
  }
  if (Game.time % config.nextRoom.intervalToCheck !== 0) {
    return;
  }
  brain.debugLog('nextroomer', 'handleNextroom');

  const possibleRooms = Object.keys(global.data.rooms).filter(isClaimableRoom);
  if (possibleRooms.length > 0) {
    const roomsWithinReach = possibleRooms.filter((room) => findRoomsWithinReach(room).length > 0);
    brain.debugLog('nextroomer', `roomsWithinReach: ${JSON.stringify(roomsWithinReach)}`);

    const evaluatedRooms = getNextRoomValuatedRoomMap(roomsWithinReach);
    const selectedRoomName = evaluatedRooms[0].roomName;

    const possibleMyRooms = findRoomsWithinReach(selectedRoomName);
    const selectedMyRoom = possibleMyRooms[Math.floor(Math.random() * possibleMyRooms.length)];
    brain.debugLog('nextroomer', `handleNextroom - Will claim: ${selectedRoomName} from ${selectedMyRoom} based on ${JSON.stringify(evaluatedRooms)}`);
    // TODO selected the closest, highest energy, highest spawn idle room to spawn the claimer
    const room = Game.rooms[selectedMyRoom];
    const selectedRoomData = global.data.rooms[selectedRoomName];
    room.checkRoleToSpawn('claimer', 1, selectedRoomData.controllerId, selectedRoomName);
    for (const myRoomName of possibleMyRooms) {
      const myRoom = Game.rooms[myRoomName];
      if (!myRoom.isStruggeling()) {
        continue;
      }
      myRoom.checkRoleToSpawn('nextroomer', 1, selectedRoomData.controllerId, selectedRoomName);
    }
    return;
  }

  for (const roomName of Memory.myRooms) {
    const room = Game.rooms[roomName];
    room.debugLog('nextroomer', `brain.handleNextroom spawn scout to find claimable rooms`);
    room.checkRoleToSpawn('scout');
  }
};
