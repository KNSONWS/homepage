import test from 'node:test'
import assert from 'node:assert/strict'
import { loadModule } from './load.mjs'

const { TIME_STEP, MAX_STEP_MINUTES, roundUpToStep, isValidStep, stepOptions, stepLabel } = await loadModule('src/lib/timeSteps.js')
const {
  supportMinutes, parseSupporters, serializeSupporters, worksheetMinutes, firstName,
  canAddOwnSupport, upsertSupporter, removeSupporter, validateSupporters,
} = await loadModule('src/lib/support.js')

const andrej = { employeeId: 'a', name: 'Andrej Stevanovski', task: 'Farbkonzept' }
const nico = { employeeId: 'n', name: 'Nico Rech', task: 'Texte' }

test('Raster: 15 Minuten bis 12 Stunden', () => {
  assert.equal(TIME_STEP, 15)
  assert.equal(MAX_STEP_MINUTES, 720)
})

test('roundUpToStep rundet auf, 0 und leer werden 15', () => {
  assert.equal(roundUpToStep(0), 15)
  assert.equal(roundUpToStep(null), 15)
  assert.equal(roundUpToStep(-10), 15)
  assert.equal(roundUpToStep(50), 60)
  assert.equal(roundUpToStep(60), 60)
  assert.equal(roundUpToStep(61), 75)
  assert.equal(roundUpToStep(70), 75)
})

test('isValidStep: nur ganze Vielfache von 15 bis 720', () => {
  for (const ok of [15, 45, 720]) assert.equal(isValidStep(ok), true, String(ok))
  for (const bad of [70, 0, 735, 'x', 7.5, -15, null]) assert.equal(isValidStep(bad), false, String(bad))
})

test('stepOptions: 48 Werte mit deutschen Beschriftungen', () => {
  const opts = stepOptions()
  assert.equal(opts.length, 48)
  assert.deepEqual(opts[0], { value: 15, label: '15 min' })
  assert.deepEqual(opts[3], { value: 60, label: '1 h' })
  assert.deepEqual(opts[4], { value: 75, label: '1 h 15 min' })
  assert.deepEqual(opts[47], { value: 720, label: '12 h' })
  // Ein gueltiger Wert ueber 12 h (altes Blatt) bleibt waehlbar
  assert.equal(stepOptions(900).length, 49)
  assert.equal(stepOptions(60).length, 48)
  assert.equal(stepLabel(135), '2 h 15 min')
})

test('supportMinutes: Hälfte, aufgerundet auf 15', () => {
  const cases = [[15, 15], [30, 15], [45, 30], [60, 30], [75, 45], [70, 45], [0, 0], [-5, 0], ['60', 30], [null, 0]]
  for (const [total, expected] of cases) assert.equal(supportMinutes(total), expected, `${total}`)
})

test('parseSupporters ist fehlertolerant', () => {
  assert.deepEqual(parseSupporters('kaputt'), [])
  assert.deepEqual(parseSupporters('{}'), [])
  assert.deepEqual(parseSupporters(null), [])
  assert.deepEqual(parseSupporters(''), [])
  const raw = '[{"employeeId":"a","name":"Andrej S","task":" Farbe "},{"employeeId":"a","name":"x","task":"y"},{"employeeId":"b","name":"Nico"},null,"x"]'
  assert.deepEqual(parseSupporters(raw), [{ employeeId: 'a', name: 'Andrej S', task: 'Farbe' }])
  assert.equal(parseSupporters([{ employeeId: 'a', name: 'A', task: 'x'.repeat(250) }])[0].task.length, 200)
})

test('serializeSupporters und parseSupporters passen zusammen', () => {
  assert.deepEqual(parseSupporters(serializeSupporters([andrej, nico])), [andrej, nico])
  assert.equal(serializeSupporters([]), '[]')
})

test('worksheetMinutes: Arbeitszeit plus je Person die Unterstützung', () => {
  assert.equal(worksheetMinutes({ totalTime: 60, supporters: serializeSupporters([andrej, nico]) }), 120)
  assert.equal(worksheetMinutes({ totalTime: 70, supporters: serializeSupporters([andrej]) }), 115)
  assert.equal(worksheetMinutes({ totalTime: 45 }), 45)
  assert.equal(worksheetMinutes({ totalTime: 0, supporters: serializeSupporters([andrej]) }), 0)
  assert.equal(worksheetMinutes({ totalTime: 60, supporters: 'kaputt' }), 60)
})

test('firstName', () => {
  assert.equal(firstName('Andrej Stevanovski'), 'Andrej')
  assert.equal(firstName('  Nico  '), 'Nico')
  assert.equal(firstName(''), '')
})

test('canAddOwnSupport: nur fremde Blätter mit Arbeitszeit', () => {
  const kenso = { $id: 'kenso-admin', name: 'Kenso Grimm' }
  const kensoEmp = { shortcode: 'KNSO', displayName: 'Kenso Grimm' }
  const andrejUser = { $id: 'andrej', name: 'Andrej Stevanovski' }
  const andrejEmp = { shortcode: 'ANDJ', displayName: 'Andrej Stevanovski' }
  const fremd = { employeeId: 'justin', totalTime: 60, isComment: false, serviceType: 'Remote' }
  assert.equal(canAddOwnSupport(fremd, kenso, kensoEmp), true)
  assert.equal(canAddOwnSupport({ ...fremd, employeeId: 'kenso-admin' }, kenso, kensoEmp), false)
  assert.equal(canAddOwnSupport({ ...fremd, isComment: true }, kenso, kensoEmp), false)
  assert.equal(canAddOwnSupport({ ...fremd, totalTime: 0 }, kenso, kensoEmp), false)
  assert.equal(canAddOwnSupport(fremd, null, null), false)
  const gitOffen = { employeeId: 'gitea', employeeName: 'knso', serviceType: 'GIT', isComment: true, totalTime: 0 }
  assert.equal(canAddOwnSupport(gitOffen, andrejUser, andrejEmp), false)
  const gitFertig = { ...gitOffen, isComment: false, totalTime: 45, startTime: '1400' }
  assert.equal(canAddOwnSupport(gitFertig, kenso, kensoEmp), false)
  assert.equal(canAddOwnSupport(gitFertig, andrejUser, andrejEmp), true)
})

test('upsertSupporter und removeSupporter', () => {
  const list = upsertSupporter([andrej], nico)
  assert.deepEqual(list, [andrej, nico])
  assert.deepEqual(upsertSupporter(list, { ...andrej, task: 'Logo' }), [{ ...andrej, task: 'Logo' }, nico])
  assert.deepEqual(removeSupporter(list, 'a'), [nico])
  assert.deepEqual(removeSupporter(list, 'x'), list)
})

test('validateSupporters', () => {
  assert.equal(validateSupporters([andrej, nico], 'justin'), null)
  assert.equal(validateSupporters([], 'justin'), null)
  assert.equal(validateSupporters([{ ...andrej, task: '  ' }], 'justin'), 'Bitte bei jeder Person angeben, wobei sie unterstützt hat.')
  assert.equal(validateSupporters([{ ...andrej, employeeId: '' }], 'justin'), 'Bitte in jeder Zeile eine Person auswählen.')
  assert.equal(validateSupporters([andrej, { ...andrej, task: 'x' }], 'justin'), 'Jede Person nur einmal eintragen.')
  assert.equal(validateSupporters([andrej], 'a'), 'Du kannst dich nicht selbst als Unterstützung eintragen.')
})
