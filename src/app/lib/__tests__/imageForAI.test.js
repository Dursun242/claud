import { fitWithin, AI_MAX_EDGE } from '../imageForAI'

describe('fitWithin', () => {
  it('ne touche pas une petite image', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })
  it('réduit une photo paysage par la largeur', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: AI_MAX_EDGE, height: 1176 })
  })
  it('réduit une capture d’écran haute par la hauteur (cas qui échouait)', () => {
    // Capture longue d'iPhone : 1179 px de large, 9000 px de haut
    const r = fitWithin(1179, 9000)
    expect(r.height).toBe(AI_MAX_EDGE)
    expect(r.width).toBe(205)
    expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(AI_MAX_EDGE)
  })
})
