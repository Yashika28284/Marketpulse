import { NavbarHero } from "@/components/ui/hero-with-video";
import { ThemeProvider } from "@/components/next/next-themes";

const DemoOne = () => {
  return (
    <ThemeProvider>
      <NavbarHero
        brandName="MarketPulse"
        heroTitle="Trade at the Speed of the Market"
        heroSubtitle="Live order matching, in real time"
        heroDescription="A low-latency matching engine with live order books, risk checks, and trade feeds you can watch update in real time."
        emailPlaceholder="enter@email.com"
        backgroundImage="https://images.unsplash.com/photo-1451187580459-43490279c0fa?ixlib=rb-4.0.3&auto=format&fit=crop&w=2072&q=80"
        videoUrl="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4"
      />
    </ThemeProvider>
  );
};

export { DemoOne };
