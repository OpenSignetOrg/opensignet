import { FaqSection } from '@/components/faq-section';
import { HOME_FAQS } from '@/lib/faq-content';

/** General questions at the end of the home page. */
export function HomeFaq() {
  return (
    <section className="container pb-4 pt-12 sm:pt-16">
      <FaqSection id="home-faq" items={HOME_FAQS} className="mx-auto mt-0 max-w-3xl sm:mt-0" />
    </section>
  );
}
