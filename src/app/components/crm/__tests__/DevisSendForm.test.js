import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DevisSendForm from '../DevisSendForm'

const initial = { to: 'client@exemple.fr', subject: 'Devis D-1', body: 'Bonjour' }

function setup(extra = {}) {
  const docsApi = {
    list: jest.fn().mockResolvedValue([
      { path: 'devis-documents/1__Kbis.pdf', name: 'Kbis.pdf' },
      { path: 'devis-documents/2__Décennale.pdf', name: 'Décennale.pdf' },
    ]),
    upload: jest.fn(async (file, permanent) => ({ path: `${permanent ? 'devis-documents/3__' : 'devis-envoi/u/'}${file.name}`, name: file.name })),
    remove: jest.fn().mockResolvedValue(true),
  }
  const onSubmit = jest.fn()
  render(<DevisSendForm initial={initial} filename="Devis D-1.pdf" docsApi={docsApi} onSubmit={onSubmit} onCancel={() => {}} {...extra} />)
  return { docsApi, onSubmit }
}

describe('DevisSendForm — pièces jointes', () => {
  it('documents permanents cochés par défaut, décochables, fichier ajouté au trombone', async () => {
    const { onSubmit, docsApi } = setup()
    const kbis = await screen.findByLabelText('Joindre Kbis.pdf')
    expect(kbis).toBeChecked()
    expect(screen.getByLabelText('Joindre Décennale.pdf')).toBeChecked()
    await userEvent.click(screen.getByLabelText('Joindre Décennale.pdf'))

    const file = new File(['%PDF'], 'plan.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Fichier à joindre'), file)
    await screen.findByRole('button', { name: 'Enlever plan.pdf' })
    expect(docsApi.upload).toHaveBeenCalledWith(file, false)

    await userEvent.click(screen.getByRole('button', { name: /Envoyer le devis/ }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      attachments: ['devis-documents/1__Kbis.pdf', 'devis-envoi/u/plan.pdf'],
    }))
  })

  it('ajoute et retire un document permanent', async () => {
    const { docsApi } = setup()
    await screen.findByLabelText('Joindre Kbis.pdf')
    const file = new File(['%PDF'], 'RC Pro.pdf', { type: 'application/pdf' })
    await userEvent.upload(screen.getByLabelText('Document permanent'), file)
    expect(await screen.findByLabelText('Joindre RC Pro.pdf')).toBeChecked()
    expect(docsApi.upload).toHaveBeenCalledWith(file, true)

    await userEvent.click(screen.getByRole('button', { name: 'Retirer Kbis.pdf des documents permanents' }))
    await waitFor(() => expect(screen.queryByLabelText('Joindre Kbis.pdf')).not.toBeInTheDocument())
  })

  it('sans docsApi : pas de section fichiers, attachments vide', async () => {
    const onSubmit = jest.fn()
    render(<DevisSendForm initial={initial} filename="Devis D-1.pdf" onSubmit={onSubmit} onCancel={() => {}} />)
    expect(screen.queryByRole('button', { name: /Joindre un fichier/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Envoyer le devis/ }))
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ attachments: [] }))
  })
})
