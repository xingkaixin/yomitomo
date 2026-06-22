import type { WeReadBook } from '@yomitomo/shared';
import {
  BookCoverFrame,
  nativeBookCoverStyle,
  useNativeCoverRatio,
} from '../shell/app-article-book';

export function WeReadCover({
  book,
  variant = 'book',
}: {
  book: WeReadBook;
  variant?: 'book' | 'cover';
}) {
  const { ratio, updateRatio } = useNativeCoverRatio(book.cover);

  return (
    <BookCoverFrame
      className={variant === 'cover' ? 'weread-book-cover is-flat-cover' : 'weread-book-cover'}
      imageUrl={book.cover}
      nativeCover={Boolean(book.cover)}
      style={nativeBookCoverStyle(ratio)}
      title={book.cover ? undefined : book.title.slice(0, 6)}
      onImageLoad={updateRatio}
    />
  );
}
