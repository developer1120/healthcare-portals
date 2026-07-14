import { pageParam, paginate } from './paginate';

const letters = 'abcdefghijklmnopqrstuvw'.split(''); // 23 items

describe('paginate', () => {
  it('slices a page and says where it is', () => {
    expect(paginate(letters, 1, 10)).toMatchObject({ page: 1, pageCount: 3, from: 1, to: 10, total: 23 });
    expect(paginate(letters, 3, 10)).toMatchObject({ items: ['u', 'v', 'w'], from: 21, to: 23 });
  });

  it('lands on the nearest real page for anything out of range', () => {
    expect(paginate(letters, 9, 10).page).toBe(3);
    expect(paginate(letters, 0, 10).page).toBe(1);
    expect(paginate(letters, -2, 10).page).toBe(1);
    expect(paginate(letters, 2.7, 10).page).toBe(2);
    expect(paginate(letters, Number.NaN, 10).page).toBe(1);
  });

  it('copes with an empty list', () => {
    expect(paginate([], 4, 10)).toEqual({ items: [], page: 1, pageCount: 1, from: 0, to: 0, total: 0 });
  });

  it('reads the page from the URL', () => {
    expect(pageParam(new URLSearchParams('page=3'))).toBe(3);
    expect(pageParam(new URLSearchParams(''))).toBe(1);
    expect(pageParam(new URLSearchParams('page=abc'))).toBe(1);
    expect(pageParam(new URLSearchParams('p=2'), 'p')).toBe(2);
  });
});
