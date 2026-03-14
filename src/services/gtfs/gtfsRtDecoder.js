import protobuf from 'protobufjs';

let FeedMessage = null;

async function loadProto() {
  if (FeedMessage) return FeedMessage;
  const root = await protobuf.load('/proto/gtfs-realtime.proto');
  FeedMessage = root.lookupType('transit_realtime.FeedMessage');
  return FeedMessage;
}

export async function decodeVehiclePositions(buffer) {
  const FM = await loadProto();
  const msg = FM.decode(new Uint8Array(buffer));
  const feed = FM.toObject(msg, { longs: Number, defaults: true });

  return (feed.entity || [])
    .filter((e) => e.vehicle?.position)
    .map((e) => ({
      vehicleId: e.vehicle.vehicle?.id || e.id,
      tripId: e.vehicle.trip?.tripId,
      routeId: e.vehicle.trip?.routeId,
      lat: e.vehicle.position.latitude,
      lng: e.vehicle.position.longitude,
      bearing: e.vehicle.position.bearing,
      timestamp: e.vehicle.timestamp,
    }));
}

export async function decodeTripUpdates(buffer) {
  const FM = await loadProto();
  const msg = FM.decode(new Uint8Array(buffer));
  const feed = FM.toObject(msg, { longs: Number, defaults: true });

  return (feed.entity || [])
    .filter((e) => e.tripUpdate)
    .map((e) => ({
      tripId: e.tripUpdate.trip?.tripId,
      routeId: e.tripUpdate.trip?.routeId,
      stopTimeUpdates: (e.tripUpdate.stopTimeUpdate || []).map((stu) => ({
        stopId: stu.stopId,
        stopSequence: stu.stopSequence,
        arrivalDelay: stu.arrival?.delay || 0,
        departureDelay: stu.departure?.delay || 0,
        departureTime: stu.departure?.time,
      })),
    }));
}
