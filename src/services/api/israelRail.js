import { railApi } from './axiosInstance';
import { format } from 'date-fns';

export async function getTrainDepartures(fromStation, toStation, date = new Date(), signal) {
  const { data } = await railApi.get('/Plan/GetRoutes', {
    params: {
      FromStation: fromStation,
      ToStation: toStation,
      Date: format(date, 'yyyyMMdd'),
      Hour: format(date, 'HHmm'),
      Mot: 0,
      scheduleType: 1,
    },
    signal,
  });
  return data?.Data?.Routes || [];
}

export async function getStationBoard(stationCode, date = new Date()) {
  const { data } = await railApi.get('/Plan/GetRoutes', {
    params: {
      FromStation: stationCode,
      ToStation: 3700, // Tel Aviv default for board queries
      Date: format(date, 'yyyyMMdd'),
      Hour: format(date, 'HHmm'),
      Mot: 0,
      scheduleType: 1,
    },
  });
  return data?.Data?.Routes || [];
}
