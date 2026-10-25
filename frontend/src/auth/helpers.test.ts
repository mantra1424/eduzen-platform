import { roleLabel } from '../labels'
import { safeRedirectPath } from './redirect'
import { slugify } from './slug'

describe('safeRedirectPath', () => {
  it.each([
    ['/groups', '/groups'],
    ['/groups?tab=1', '/groups?tab=1'],
    [undefined, '/'],
    ['', '/'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['https://evil.com', '/'],
    ['javascript:alert(1)', '/'],
  ])('%s -> %s', (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected)
  })
})

describe('slugify', () => {
  it.each([
    ['SVMIT College', 'svmit-college'],
    ['  Acme   Corp!! ', 'acme-corp'],
    ['École Polytechnique', 'ecole-polytechnique'],
    ['---', ''],
  ])('%s -> %s', (input, expected) => {
    expect(slugify(input)).toBe(expected)
  })

  it('stays within 50 characters without a trailing hyphen', () => {
    const slug = slugify('a'.repeat(49) + ' b')
    expect(slug.length).toBeLessThanOrEqual(50)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('roleLabel', () => {
  it('uses wording that fits the organisation', () => {
    expect(roleLabel('learner', 'college')).toBe('Student')
    expect(roleLabel('learner', 'company')).toBe('Employee')
    expect(roleLabel('instructor', 'company')).toBe('Trainer')
  })
})
