import { beforeEach, describe, expect, it } from 'vitest';
import { formatPdfAuthors, formatPdfHeaderAuthors } from '../shell/app-article-book';
import { initializeAppI18n } from '../i18n/app-i18n';

describe('PDF display metadata', () => {
  beforeEach(() => {
    initializeAppI18n('zh-CN');
  });

  it('shows one English author with et al. on PDF covers', () => {
    expect(formatPdfAuthors('BASANT MOUNIR; FARIDA MADKOUR; AMIRA ABDEL', { maxAuthors: 1 })).toBe(
      'Basant Mounir et al.',
    );
  });

  it('shows one Chinese author with 等 on PDF covers', () => {
    expect(formatPdfAuthors('张三；李四；王五', { maxAuthors: 1 })).toBe('张三 等');
  });

  it('shows several list authors before summarizing', () => {
    expect(
      formatPdfAuthors('SIRAN LI; ECE SENA ETOGLU; CARSTEN EICKHOFF; MARIA GARCIA', {
        maxAuthors: 3,
      }),
    ).toBe('Siran Li; Ece Sena Etoglu; Carsten Eickhoff et al.');
  });

  it('reduces visible list authors to fit a length budget', () => {
    expect(
      formatPdfAuthors('PENNY CHONG; HARSHAVARDHAN ABHICHANDANI; JIYUAN WANG', {
        maxAuthors: 3,
        maxLength: 42,
      }),
    ).toBe('Penny Chong et al.');
    expect(
      formatPdfAuthors('BASANT MOUNIR; FARIDA MADKOUR; AMIRA ABDEL; JOHN SMITH', {
        maxAuthors: 3,
        maxLength: 42,
      }),
    ).toBe('Basant Mounir; Farida Madkour et al.');
  });

  it('formats PDF reader header authors with a wider budget than library lists', () => {
    const authors =
      'PENNY CHONG; HARSHAVARDHAN ABHICHANDANI; JIYUAN WANG; BASANT MOUNIR; FARIDA MADKOUR; AMIRA ABDEL; JOHN SMITH';

    expect(formatPdfAuthors(authors, { maxAuthors: 3, maxLength: 42 })).toBe('Penny Chong et al.');
    expect(formatPdfHeaderAuthors(authors)).toBe(
      'Penny Chong; Harshavardhan Abhichandani; Jiyuan Wang et al.',
    );
  });

  it('returns an empty PDF reader header author label for blank metadata', () => {
    expect(formatPdfHeaderAuthors('   ')).toBe('');
  });
});
