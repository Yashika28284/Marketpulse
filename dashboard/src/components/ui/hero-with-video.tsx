import React, { useState, useRef, useEffect } from 'react';
import { Mail, ArrowRight, Menu, ChevronDown } from 'lucide-react';

interface NavbarHeroProps {
  brandName?: string;
  heroTitle?: string;
  heroSubtitle?: string;
  heroDescription?: string;
  backgroundImage?: string;
  videoUrl?: string;
  emailPlaceholder?: string;
}

const NavbarHero: React.FC<NavbarHeroProps> = ({
  brandName = "MarketPulse",
  heroTitle = "Innovation Meets Simplicity",
  heroSubtitle = "Join the community",
  heroDescription = "Discover cutting-edge solutions designed for the modern digital landscape.",
  backgroundImage = "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2072&q=80",
  videoUrl = "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  emailPlaceholder = "enter@email.com"
}) => {
  const [email, setEmail] = useState('');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Background hero video autoplays + loops on load, like a moving
  // banner, instead of sitting on a static frame until someone clicks
  // play. Browsers only allow autoplay when the video is muted, which it
  // already is (see the <video> tag below).
  //
  // Important: isVideoPlaying only flips to true once play() actually
  // *resolves* — not just because we called it. Setting it eagerly meant
  // the static image was hidden immediately while the video was still
  // failing to load (e.g. its source blocked by a network filter), which
  // left a blank black box with nothing showing at all. On failure we
  // deliberately do nothing, so the image stays visible as the fallback.
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current
        .play()
        .then(() => setIsVideoPlaying(true))
        .catch(() => {
          // Blocked/unsupported source — the static image stays up
          // and the manual play button remains available.
        });
    }
  }, []);

  const toggleDropdown = (dropdownName: string) => {
    setOpenDropdown(openDropdown === dropdownName ? null : dropdownName);
  };

  const handleVideoEnded = () => {
    setIsVideoPlaying(false);
  };

  // Full reload (not just a hash set) because there's no client-side
  // router here — main.jsx picks the view once, on initial load, based
  // on window.location.hash.
  const goToDashboard = () => {
    window.location.href = '#dashboard';
    window.location.reload();
  };

  // "Join Now" carries the email the person just typed into the hero
  // input over to the actual register form, instead of discarding it —
  // sessionStorage is the simplest way to hand that off across the full
  // page reload goToDashboard() does.
  const goToRegister = () => {
    sessionStorage.setItem('marketpulse_prefill', JSON.stringify({ mode: 'register', email }));
    goToDashboard();
  };

  return (
    <main className="absolute inset-0 bg-background overflow-y-auto">
      <div className="w-full max-w-6xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* --- Navbar --- */}
        <div className="py-2 relative z-20 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <a href="#" className="font-bold text-2xl pb-1 text-foreground cursor-pointer flex-shrink-0">
              {brandName}
            </a>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden lg:flex items-center gap-3">
              <button onClick={goToDashboard} className="bg-foreground hover:bg-muted-foreground text-background py-2.5 px-5 text-sm rounded-xl capitalize font-medium transition-colors flex items-center gap-2">Login</button>
            </div>
            <div className="lg:hidden relative">
              <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="bg-transparent hover:bg-muted border-none p-2 rounded-xl transition-colors">
                <Menu className="h-6 w-6" />
              </button>
              {isMobileMenuOpen && (
                <ul className="absolute top-full right-0 mt-2 p-2 shadow-lg bg-card border border-border rounded-xl w-56 z-30">
                  <li>
                    <button onClick={goToDashboard} className="w-full bg-foreground text-background hover:bg-muted-foreground px-3 py-2.5 text-sm rounded-lg flex items-center justify-center gap-2 font-medium">Login</button>
                  </li>
                </ul>
              )}
            </div>
          </div>
        </div>

        {/* --- Hero Section --- */}
        <div className="pt-4 pb-10 sm:pt-6 sm:pb-12 text-center">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-3xl sm:text-5xl md:text-5xl text-foreground font-bold tracking-tight">{heroTitle}</h1>
            <p className="mt-6 text-lg text-muted-foreground">{heroDescription}</p>
            <div className="mt-8 flex items-center justify-center gap-3 sm:gap-4 flex-wrap">
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
                <input type="email" placeholder={emailPlaceholder} value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') goToRegister(); }} className="w-full max-w-xs bg-muted border-border text-foreground placeholder-muted-foreground font-medium pl-10 pr-4 py-2 text-sm sm:pl-11 sm:py-3 sm:text-base rounded-full focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <button onClick={goToRegister} className="bg-foreground hover:bg-muted-foreground text-background px-5 py-2 text-sm sm:px-6 sm:py-3 sm:text-base rounded-full normal-case font-medium transition-colors flex items-center gap-2">
                Join Now<ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* --- Media Header --- */}
        <header className="relative w-full aspect-video rounded-3xl overflow-hidden">
          <img src={backgroundImage} alt="Earth from space at night" className={`w-full h-full absolute inset-0 object-cover transition-opacity duration-500 ${isVideoPlaying ? 'opacity-0' : 'opacity-100'}`} />
          <video ref={videoRef} src={videoUrl} className={`w-full h-full absolute inset-0 object-cover transition-opacity duration-500 ${isVideoPlaying ? 'opacity-100' : 'opacity-0'}`} onEnded={handleVideoEnded} playsInline muted loop autoPlay />
        </header>
      </div>
    </main>
  );
};

export { NavbarHero };
