import { API_URL } from './config';
import { io } from 'socket.io-client';

const URL = API_URL;
export const socket = io(URL, {
  autoConnect: true
});
