import { atom, preset, type Lite } from "@pumped-fn/lite";

export function mockTagAtom<T>(
  _tag: Lite.Tag<T, boolean>,
  value: T
): Lite.Preset<T> {
  const mockAtom = atom({
    factory: () => value,
  }) as Lite.Atom<T>;
  return preset(mockAtom, value);
}

export function tagValue<T>(
  tag: Lite.Tag<T, boolean>,
  value: T
): Lite.Tagged<T> {
  return tag(value);
}
