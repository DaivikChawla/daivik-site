import { about, footer, footerLinks, gdg, howIBuild, meta } from "@/lib/content";
import { ArrowUpRight } from "./Icons";

export function HowIBuild() {
  return (
    <section className="how" id="how" aria-labelledby="how-title">
      <div className="wrap">
        <h2 className="sec-title" id="how-title">
          {howIBuild.header}
        </h2>
        <div className="how-grid">
          <p className="lead">{howIBuild.paragraphs[0]}</p>
          <p className="how-p">{howIBuild.paragraphs[1]}</p>
        </div>
        <dl className="toolkit">
          {howIBuild.toolkit.map((g) => (
            <div className="tk" key={g.group}>
              <dt>{g.group}</dt>
              {g.items.map((it) => (
                <dd key={it}>{it}</dd>
              ))}
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

export function About() {
  return (
    <section className="about" id="about" aria-labelledby="about-title">
      <div className="wrap about-in">
        <h2 className="sec-title" id="about-title">
          {about.header}
        </h2>
        <div className="about-body">
          {about.paragraphs.map((p, i) => (
            <p key={i} className={i === 0 ? "lead" : undefined}>
              {p}
            </p>
          ))}
        </div>
        <ul className="outside">
          {about.outside.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function Gdg() {
  return (
    <section className="gdg" id="gdg" aria-labelledby="gdg-title">
      <div className="wrap">
        <h2 className="sec-title" id="gdg-title">
          {gdg.header}
        </h2>
        <div className="gdg-body">
          <p className="gdg-lead">{gdg.paragraphs[0]}</p>
          <p>{gdg.paragraphs[1]}</p>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      {/* the same world, finished, at blue hour: rendered by the engine as a still */}
      <div className="foot-world" aria-hidden="true">
        <picture>
          <source media="(max-width: 760px)" srcSet="/world/night-tall.webp" />
          <img src="/world/night-wide.webp" alt="" width={1600} height={1000} loading="lazy" decoding="async" />
        </picture>
      </div>
      <div className="wrap foot-in">
        <p className="foot-line">{footer.line}</p>
        <a className="foot-mail" href={`mailto:${meta.email}`}>
          {meta.email}
        </a>
        <div className="foot-row">
          <ul className="foot-links">
            {footerLinks.map((l) => (
              <li key={l.href}>
                <a href={l.href} target="_blank" rel="noopener">
                  <span>{l.label}</span>
                  <ArrowUpRight />
                </a>
              </li>
            ))}
          </ul>
          <p className="foot-small">
            <span>{footer.smallPrint}</span> <span>{footer.copyright}</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
