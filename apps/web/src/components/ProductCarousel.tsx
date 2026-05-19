import { useEffect, useState, type CSSProperties } from 'react';

export type ProductCarouselSlide = {
  title: string;
  caption: string;
  image: string;
  alt: string;
  objectPosition?: string;
};

type ProductCarouselProps = {
  slides: ProductCarouselSlide[];
  autoplayInterval?: number;
};

export function ProductCarousel({ slides, autoplayInterval = 4200 }: ProductCarouselProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;

    const timer = window.setInterval(() => {
      setActiveIndex((index) => (index + 1) % slides.length);
    }, autoplayInterval);

    return () => window.clearInterval(timer);
  }, [autoplayInterval, slides.length]);

  if (slides.length === 0) return null;

  const activeSlide = slides[activeIndex];
  const style = { '--carousel-duration': `${autoplayInterval}ms` } as CSSProperties;

  return (
    <section className="product-carousel" aria-label="产品介绍图" style={style}>
      <div className="product-carousel-frame">
        {slides.map((slide, index) => (
          <img
            key={slide.title}
            className={`product-carousel-image ${index === activeIndex ? 'is-active' : ''}`}
            src={slide.image}
            alt={slide.alt}
            style={{ objectPosition: slide.objectPosition || 'center' }}
            loading={index === 0 ? 'eager' : 'lazy'}
          />
        ))}
        <div className="product-carousel-copy">
          <span>{activeSlide.title}</span>
          <p>{activeSlide.caption}</p>
        </div>
      </div>
      <div className="product-carousel-indicators">
        {slides.map((slide, index) => (
          <button
            key={slide.title}
            className={`product-carousel-indicator ${index === activeIndex ? 'is-active' : ''}`}
            type="button"
            aria-label={`查看${slide.title}`}
            aria-pressed={index === activeIndex}
            onClick={() => setActiveIndex(index)}
          >
            <span
              key={`${activeIndex}-${index}`}
              className="product-carousel-progress"
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
    </section>
  );
}
