import mysql from 'mysql2/promise';

import { connectionSettings } from '../settings';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default async () => {
  console.log('Entering databaseReady()');
  for (; ;) {
    try {
      await mysql.createConnection(connectionSettings);
      break;
    } catch (error) {
      console.log('DB not ready, retrying in 1 sec..');
      await sleep(1000);
    }
  }
};
