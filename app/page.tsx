import { About, Footer, HowIBuild, Team } from "@/components/Closing";
import { Hero, Masthead, ProofStrip } from "@/components/Hero";
import { Story } from "@/components/Story";
import { Stage } from "@/components/world/Stage";

export default function Home() {
  return (
    <>
      <Masthead />
      <main>
        <div className="world" id="top">
          <Stage />
          <Hero />
          <ProofStrip />
          <Story />
        </div>
        <HowIBuild />
        <About />
        <Team />
      </main>
      <Footer />
    </>
  );
}
