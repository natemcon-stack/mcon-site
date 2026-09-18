import Photo from "@/components/Photo";
import { GALLERY_GROUPS, GALLERY_COUNT } from "@/lib/gallery";
import { PHONE, PHONE_HREF } from "@/lib/services";

export const metadata = {
  title: "Our work",
  description:
    "Photographs of real M-CON Enterprises Inc. projects across Powell River and the qathet region — renovations, decks, framing, roofing, restoration and commercial work.",
};

// Every photograph is of M-CON's own work. No stock photography anywhere on this site,
// which is worth stating plainly — most contractor galleries don't hold to it.
export default function Page() {
  return (
    <div className="mx-auto max-w-5xl px-5 py-14">
      <h1 className="font-display text-4xl font-700 sm:text-5xl">Our work</h1>
      <p className="mt-5 max-w-prose text-lg leading-relaxed">
        {GALLERY_COUNT} photographs from jobs across Powell River, the qathet region and
        the surrounding islands. All of them are our own work — there are no stock photos
        on this site.
      </p>

      {GALLERY_GROUPS.map((group) => (
        <section key={group.group} className="mt-14">
          <h2 className="font-display text-2xl font-700">{group.group}</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.photos.map((p) => (
              <Photo key={p.src} src={p.src} alt={p.alt} caption={p.alt} />
            ))}
          </div>
        </section>
      ))}

      <p className="mt-16">
        <a
          href={PHONE_HREF}
          className="inline-block bg-red px-6 py-3 font-display text-lg font-600 text-paper hover:bg-red-dark"
        >
          Call {PHONE}
        </a>
      </p>
    </div>
  );
}
