import { hero, meta, proof, proofNotes } from "@/lib/content";
import { ArrowDown, ArrowUpRight, Star } from "./Icons";

export function Masthead() {
  return (
    <header className="mast">
      <div className="wrap mast-in">
        <a className="mast-name" href="#top">
          {meta.name}
        </a>
        <a className="mast-mail" href={`mailto:${meta.email}`}>
          {meta.email}
        </a>
      </div>
    </header>
  );
}

export function Hero() {
  return (
    <section className="hero" data-step="hero" aria-labelledby="hero-title">
      <div className="wrap hero-in">
        <div className="hero-copy">
          <p className="eyebrow">{hero.eyebrow}</p>
          <h1 className="display" id="hero-title">
            {hero.headline}
          </h1>
          <p className="hero-sub">{hero.sub}</p>
          <div className="ctas">
            <a className="btn btn-primary" href="#work">
              <span>{hero.ctaPrimary}</span>
              <ArrowDown />
            </a>
            <a className="btn btn-ghost" href={meta.resume} download>
              <span>{hero.ctaSecondary}</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ProofStrip() {
  return (
    <section className="proof" aria-label="Proof">
      <div className="wrap">
        <div className="proof-card">
          <div className="ledger">
            {proof.map((p) => (
              <a
                key={p.note}
                className="cell"
                href={p.href}
                {...(p.external ? { target: "_blank", rel: "noopener" } : {})}
              >
                <span className="big">
                  {p.big}
                  {p.star ? <Star /> : null}
                  <sup className="fn">{p.note}</sup>
                </span>
                <span className="small">{p.small}</span>
              </a>
            ))}
          </div>
          <ol className="notes">
            {proofNotes.map((n) => (
              <li key={n.marks}>
                <a href={n.href} {...(n.external ? { target: "_blank", rel: "noopener" } : {})}>
                  <span className="fn">{n.marks}</span>
                  <span>{n.label}</span>
                  {n.external ? <ArrowUpRight /> : <ArrowDown />}
                </a>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
