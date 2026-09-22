import { PHONE, PHONE_HREF } from "@/lib/services";

// A persistent call button, phones only.
//
// On a trade site the phone is the conversion. Someone reading the restoration page at
// 11pm with water coming through their ceiling should not have to scroll back to the top
// to find the number. Hidden from 640px up, where the number is already in the header
// and always visible.
export default function CallBar() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-red-dark bg-red sm:hidden">
      <a
        href={PHONE_HREF}
        className="block py-3.5 text-center font-display text-lg font-600 text-paper"
      >
        Call {PHONE}
      </a>
    </div>
  );
}
