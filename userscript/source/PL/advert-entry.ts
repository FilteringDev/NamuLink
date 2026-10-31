import { FindPL2ContainerForTest } from './advert.js'

declare global {
  interface Window {
    __PL2_FIND__?: typeof FindPL2ContainerForTest
  }
}

window.__PL2_FIND__ = FindPL2ContainerForTest
