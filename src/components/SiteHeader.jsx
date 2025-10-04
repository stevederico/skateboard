import constants from "../constants.json";

export default function SiteHeader({ title }) {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <h1 className="text-base font-medium">{title || constants.appName}</h1>
      </div>
    </header>
  );
}
