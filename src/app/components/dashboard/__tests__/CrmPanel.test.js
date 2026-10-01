import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

jest.mock('../../../dashboards/shared', () => ({ fmtMoney: (n) => `${Math.round(Number(n) || 0)} €` }))

// eslint-disable-next-line import/first
import CrmPanel from '../CrmPanel'

const kpis = { affairesActives: 6, pipelineHT: 25516, pondereHT: 13068, devisEnAttente: 4, devisEnAttenteHT: 19267, signes30j: 1, signes30jHT: 9000, tauxSignature: 67 }
const items = Array.from({ length: 6 }, (_, i) => ({
  kind: i === 0 ? 'chaud' : 'dormante', oppId: `o${i}`, devisId: null, montant: 1000 * (i + 1),
  title: `Signal ${i}`, sub: `Affaire ${i}`, hint: 'À faire',
}))

it('chiffres clés, signaux, ouverture de l’affaire et des relances', async () => {
  const onOpen = jest.fn()
  const user = userEvent.setup()
  render(<CrmPanel insights={{ kpis, items }} nbOverdue={2} onOpen={onOpen} m={false} />)
  expect(screen.getByText('25516 €')).toBeInTheDocument()
  expect(screen.getByText('67 %')).toBeInTheDocument()
  expect(screen.getByText('À saisir · 6')).toBeInTheDocument()
  expect(screen.queryByText('Signal 5')).not.toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: /Signal 0/ }))
  expect(onOpen).toHaveBeenCalledWith('crm', 'o0')
  await user.click(screen.getByRole('button', { name: '2 relances en retard' }))
  expect(onOpen).toHaveBeenCalledWith('crm', 'relances')
  await user.click(screen.getByRole('button', { name: 'Voir le dernier' }))
  expect(screen.getByText('Signal 5')).toBeInTheDocument()
})

it('sans signal : chiffres seuls', () => {
  render(<CrmPanel insights={{ kpis: { ...kpis, tauxSignature: null }, items: [] }} onOpen={() => {}} m />)
  expect(screen.getByText('—')).toBeInTheDocument()
  expect(screen.queryByText(/À saisir/)).not.toBeInTheDocument()
})
