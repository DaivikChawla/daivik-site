import Image from "next/image";
import { mysteryStudios as ms, pagewalla as pw, vesper as vs, type LinkButton } from "@/lib/content";
import { ArrowRight, ArrowUpRight, Block } from "./Icons";

function Buttons({ items }: { items: LinkButton[] }) {
  return (
    <div className="v-ctas">
      {items.map((b, i) => (
        <a key={b.href} className={i === 0 ? "btn btn-ink" : "btn btn-line"} href={b.href} target="_blank" rel="noopener">
          <span>{b.label}</span>
          <ArrowUpRight />
        </a>
      ))}
    </div>
  );
}

function Running({ name }: { name: string }) {
  return <p className="running">{name}</p>;
}

/**
 * The Work section. Each .step is one beat of the scroll story; the sticky
 * world stage behind it reads data-step to choose what to build and where to look.
 */
export function Story() {
  return (
    <section className="story" id="work" aria-label="Work">
      {/* MysteryStudios, beat 1: introduce it while the first blocks go down by hand */}
      <article className="step" data-step="hand" aria-labelledby="ms-title">
        <div className="placard">
          <p className="tag">
            <Block tone="hand" />
            <span>
              {ms.tag.role} · {ms.tag.from} <ArrowRight className="ico ico-inline" />
              <span className="sr-only">→</span> {ms.tag.to}
            </span>
          </p>
          <h2 className="v-title" id="ms-title">
            {ms.name}
            <span className="v-sub">{ms.sub}</span>
          </h2>
          <p className="v-line">{ms.line}</p>
          <p className="key key-hand">
            <Block tone="hand" />
            <span>{ms.byHand}</span>
          </p>
        </div>
      </article>

      {/* beat 2: automation takes over and the world builds itself */}
      <div className="step step-key" data-step="auto">
        <div className="placard placard-slim">
          <Running name={ms.name} />
          <p className="key key-auto">
            <Block tone="auto" />
            <span>{ms.automated}</span>
          </p>
        </div>
      </div>

      {/* beat 3: the finished studio, close up */}
      <div className="step" data-step="mysterystudios" id={ms.id}>
        <div className="placard">
          <Running name={ms.name} />
          <div className="v-body">
            {ms.body.map((p) => (
              <p key={p.slice(0, 24)}>{p}</p>
            ))}
          </div>
          <Buttons items={ms.buttons} />
        </div>
      </div>

      <article className="step" data-step="pagewalla" id={pw.id} aria-labelledby="pw-title">
        <div className="placard placard-wide">
          <p className="tag">
            <span className="sw sw-pw" aria-hidden="true" />
            <span>{pw.tag}</span>
          </p>
          <h2 className="v-title" id="pw-title">
            {pw.name}
            <span className="v-sub">{pw.sub}</span>
          </h2>
          <p className="v-line">{pw.line}</p>
          <div className="v-body">
            {pw.body.map((p) => (
              <p key={p.slice(0, 24)}>{p}</p>
            ))}
          </div>
          <Buttons items={pw.buttons} />
          <div className="shots">
            {pw.shots.map((s) => (
              <a key={s.href} className="shot" href={s.href} target="_blank" rel="noopener">
                <span className="shot-bar">
                  <span>{s.host}</span>
                  <ArrowUpRight />
                </span>
                <span className="shot-img">
                  <Image src={s.src} alt={s.alt} width={1120} height={700} sizes="(max-width: 760px) 44vw, 260px" loading="lazy" />
                </span>
              </a>
            ))}
          </div>
        </div>
      </article>

      <article className="step" data-step="vesper" id={vs.id} aria-labelledby="vs-title">
        <div className="placard">
          <p className="tag">
            <span className="sw sw-vs" aria-hidden="true" />
            <span>{vs.tag}</span>
          </p>
          <h2 className="v-title" id="vs-title">
            {vs.name}
            <span className="v-sub">{vs.sub}</span>
          </h2>
          <p className="v-line">{vs.line}</p>
          <div className="v-body">
            {vs.body.map((p) => (
              <p key={p.slice(0, 24)}>{p}</p>
            ))}
          </div>
          <p className="credit">{vs.credit}</p>
        </div>
      </article>

      {/* the pull-back: no copy, just the finished world at golden hour */}
      <div className="step step-finale" data-step="finale" aria-hidden="true" />
    </section>
  );
}
