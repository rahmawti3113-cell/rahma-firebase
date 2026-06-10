import React, { useEffect, useState, useRef } from 'react';
import { ref, onValue, set, update } from 'firebase/database';
import { signOut } from 'firebase/auth';
import { db, auth } from './firebase';
import { Thermometer, Droplets, Power, LogOut, Mic, MicOff, Volume2 } from 'lucide-react';

interface IoTData {
  Suhu: number;
  Kelembapan: number;
  Relay1: boolean;
  Relay2: boolean;
  Relay3: boolean;
  Relay4: boolean;
}

export default function Dashboard() {
  const [data, setData] = useState<IoTData>({
    Suhu: 0,
    Kelembapan: 0,
    Relay1: false,
    Relay2: false,
    Relay3: false,
    Relay4: false,
  });

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [runningMode, setRunningMode] = useState<'none' | 'var1' | 'var2'>('none');
  const recognitionRef = useRef<any>(null);
  const stepRef = useRef(0);
  
  // To keep reference inside callbacks
  const dataRef = useRef(data);
  dataRef.current = data;

  // Timer for variations removed because ESP handles it now using Mode


  useEffect(() => {
    const iotRef = ref(db, 'IoT');
    const unsubscribe = onValue(iotRef, (snapshot) => {
      if (snapshot.exists()) {
        const value = snapshot.val();
        setData({
          Suhu: value.Suhu || 0,
          Kelembapan: value.Kelembapan || 0,
          Relay1: value.Relay1 || false,
          Relay2: value.Relay2 || false,
          Relay3: value.Relay3 || false,
          Relay4: value.Relay4 || false,
        });
      }
    });

    return () => unsubscribe();
  }, []);

  const toggleRelay = (relayNum: number) => {
    setRunningMode('none');
    const relayKey = `Relay${relayNum}` as keyof IoTData;
    const currentState = data[relayKey];
    update(ref(db, 'IoT'), {
      [relayKey]: !currentState,
      Mode: 0,
      AllOff: false
    });
  };

  const setAllRelays = (state: boolean) => {
    setRunningMode('none');
    if (state) {
      update(ref(db, 'IoT'), {
        Relay1: true,
        Relay2: true,
        Relay3: true,
        Relay4: true,
        Mode: 0,
        AllOff: false
      });
    } else {
      update(ref(db, 'IoT'), {
        Relay1: false,
        Relay2: false,
        Relay3: false,
        Relay4: false,
        Mode: 0,
        AllOff: true
      });
    }
  };

  const setVariasi = (mode: 1 | 2) => {
    setRunningMode(`var${mode}`);
    update(ref(db, 'IoT'), { Mode: mode, AllOff: false });
  };

  const stopVariasi = () => {
    setRunningMode('none');
    update(ref(db, 'IoT'), { Mode: 0 });
  };

  const handleLogout = () => {
    signOut(auth);
  };

  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel(); // Hentikan suara yang sedang berjalan
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'id-ID'; 
      utterance.volume = 1.0;
      utterance.rate = 1.0;
      utterance.pitch = 1.2; // Pitch sedikit dinaikkan agar lebih terdengar feminin jika voice default
      
      const voices = window.speechSynthesis.getVoices();
      
      // Mencari semua suara berbahasa Indonesia
      const idVoices = voices.filter(v => v.lang.includes('id-ID') || v.lang.includes('id_ID') || v.lang === 'id');
      
      if (idVoices.length > 0) {
        // Prioritaskan "Google Bahasa Indonesia" (biasanya wanita)
        const googleVoice = idVoices.find(v => v.name.includes('Google'));
        // Hindari "Andika" (suara pria Microsoft)
        const femaleVoice = idVoices.find(v => !v.name.includes('Andika') && !v.name.includes('Male'));
        
        utterance.voice = googleVoice || femaleVoice || idVoices[0];
      }
      
      window.speechSynthesis.speak(utterance);
    } else {
      console.log("Speech Synthesis tidak didukung browser ini");
    }
  };

  // Ensure voices are loaded to pick the correct Indonesian Voice
  useEffect(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.getVoices();
      };
    }
  }, []);

  const setupVoiceRecognition = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Browser Anda tidak mendukung fitur pengenalan suara.');
      return;
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'id-ID';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const current = event.resultIndex;
      const result = event.results[current][0].transcript.toLowerCase();
      setTranscript(result);
      processCommand(result);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
  };

  useEffect(() => {
    setupVoiceRecognition();
  }, []);

  const processCommand = (command: string) => {
    // Helper function for matching multiple phrases
    const match = (phrases: string[]) => phrases.some(p => command.includes(p));

    if (match(['variasi 1', 'variasi satu'])) {
      setVariasi(1);
      speak('Menjalankan variasi satu pada relay');
    } else if (match(['variasi 2', 'variasi dua'])) {
      setVariasi(2);
      speak('Menjalankan variasi dua pada relay');
    } else if (match(['suhu', 'temperatur'])) {
      speak(`Suhu saat ini adalah ${dataRef.current.Suhu} derajat celcius`);
    } else if (match(['kelembapan', 'lembab'])) {
      speak(`Kelembapan saat ini adalah ${dataRef.current.Kelembapan} persen`);
    } else if (match(['nyalakan semua', 'hidupkan semua', 'semua relay on', 'semua on'])) {
      setAllRelays(true);
      speak('Semua relay dinyalakan');
    } else if (match(['matikan semua', 'semua relay off', 'semua off'])) {
      setAllRelays(false);
      speak('Semua relay dimatikan');
    } else if (match(['nyalakan relay 1', 'hidupkan relay 1', 'nyalakan relay satu', 'hidupkan relay satu', 'nyalakan satu'])) {
      update(ref(db, 'IoT'), { Relay1: true, Mode: 0, AllOff: false });
      setRunningMode('none');
      speak('Relay satu dinyalakan');
    } else if (match(['matikan relay 1', 'matikan relay satu', 'matikan satu'])) {
      update(ref(db, 'IoT'), { Relay1: false, Mode: 0, AllOff: false });
      setRunningMode('none');
      speak('Relay satu dimatikan');
    } else if (match(['nyalakan relay 2', 'hidupkan relay 2', 'nyalakan relay dua', 'hidupkan relay dua', 'nyalakan dua'])) {
      update(ref(db, 'IoT'), { Relay2: true, Mode: 0, AllOff: false });
      setRunningMode('none');
      speak('Relay dua dinyalakan');
    } else if (match(['matikan relay 2', 'matikan relay dua', 'matikan dua'])) {
      update(ref(db, 'IoT'), { Relay2: false, Mode: 0, AllOff: false });
      setRunningMode('none');
      speak('Relay dua dimatikan');
    } else if (match(['nyalakan relay 3', 'hidupkan relay 3', 'nyalakan relay tiga', 'hidupkan relay tiga', 'nyalakan tiga'])) {
      update(ref(db, 'IoT'), { Relay3: true, Mode: 0, AllOff: false });
      setRunningMode('none');
      speak('Relay tiga dinyalakan');
    } else if (match(['matikan relay 3', 'matikan relay tiga', 'matikan tiga'])) {
      update(ref(db, 'IoT'), { Relay3: false, Mode: 0, AllOff: false });
      setRunningMode('none');
      speak('Relay tiga dimatikan');
    } else if (match(['nyalakan relay 4', 'hidupkan relay 4', 'nyalakan relay empat', 'hidupkan relay empat', 'nyalakan empat'])) {
      update(ref(db, 'IoT'), { Relay4: true, Mode: 0, AllOff: false });
      setRunningMode('none');
      speak('Relay empat dinyalakan');
    } else if (match(['matikan relay 4', 'matikan relay empat', 'matikan empat'])) {
      update(ref(db, 'IoT'), { Relay4: false, Mode: 0, AllOff: false });
      setRunningMode('none');
      speak('Relay empat dimatikan');
    } else {
      speak('Perintah tidak dikenali');
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
  };

  return (
    <div className="h-screen bg-[#0f172a] text-[#f8fafc] font-sans flex flex-col overflow-hidden">
      {/* Header */}
      <header className="px-6 py-5 md:px-10 bg-[#0f172a]/80 backdrop-blur-md border-b border-white/10 flex justify-between items-center shrink-0">
        <div>
          <span className="font-bold tracking-wide text-[#38bdf8]">RAHMA</span>
          <span className="font-light ml-2 opacity-80 uppercase text-sm hidden sm:inline-block">IoT Dashboard</span>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div className="hidden sm:flex items-center gap-2">
             <div className="w-2 h-2 bg-[#22c55e] rounded-full"></div>
             Firebase Connected
          </div>
          <button
            onClick={handleLogout}
            className="text-[#94a3b8] hover:text-white transition-colors flex items-center gap-2"
            title="Logout"
          >
            <LogOut size={18} />
            <span className="hidden sm:inline-block text-xs font-semibold">LOGOUT</span>
          </button>
        </div>
      </header>

      {/* Main Panel */}
      <main className="flex-1 overflow-y-auto p-6 md:p-10 flex flex-col gap-8 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.05),transparent)]">
        
        {/* Sensors Grid */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto w-full">
          {/* Temperature */}
          <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-6 relative shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)]">
            <div className="text-sm text-[#94a3b8]">Suhu Ruangan</div>
            <div className="text-[48px] font-bold text-[#38bdf8] mt-2 leading-none flex items-baseline">
              {parseFloat(data.Suhu.toString()).toFixed(1)}
              <span className="text-2xl text-[#94a3b8] ml-2">°C</span>
            </div>
            <div className="mt-4 text-[11px] opacity-50 text-[#f8fafc]">Update dari Firebase</div>
          </div>

          {/* Humidity */}
          <div className="bg-[#1e293b] border border-white/5 rounded-2xl p-6 relative shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)]">
            <div className="text-sm text-[#94a3b8]">Kelembapan</div>
            <div className="text-[48px] font-bold text-[#38bdf8] mt-2 leading-none flex items-baseline">
              {parseFloat(data.Kelembapan.toString()).toFixed(1)}
              <span className="text-2xl text-[#94a3b8] ml-2">%</span>
            </div>
            <div className="mt-4 text-[11px] opacity-50 text-[#f8fafc]">Sensor DHT22</div>
          </div>
        </section>

        {/* Relays Section */}
        <section className="max-w-5xl mx-auto w-full">
          <h3 className="m-0 mb-5 text-lg font-semibold text-[#94a3b8]">Kontrol Relay Digital</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[1, 2, 3, 4].map((num) => {
              const isOn = data[`Relay${num}` as keyof IoTData];
              const deviceName = `Relay ${num}`;
              return (
                <div 
                  key={num}
                  onClick={() => toggleRelay(num)}
                  className={`border rounded-2xl p-6 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)] flex items-center justify-between cursor-pointer hover:-translate-y-1 transition-all group ${runningMode !== 'none' ? 'bg-[#1e293b]/50 border-white/5 opacity-80' : 'bg-[#1e293b] border-white/5 hover:border-white/10'}`}
                >
                  <div>
                    <div className="font-semibold text-base text-[#f8fafc]">{deviceName}</div>
                    <div className={`text-xs mt-1 transition-colors ${isOn ? 'text-[#22c55e]' : 'text-[#94a3b8]'}`}>
                      {isOn ? 'Active (ON)' : 'Standby (OFF)'}
                    </div>
                  </div>
                  <div className={`w-[44px] h-[24px] rounded-full relative transition-colors duration-[50ms] ${isOn ? 'bg-[#22c55e]' : 'bg-[#334155]'}`}>
                    <div className={`w-5 h-5 bg-white rounded-full absolute top-[2px] transition-all duration-[50ms] ${isOn ? 'left-[22px]' : 'left-[2px]'}`} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick Actions / Variations */}
          <div className="mt-8">
            <h3 className="m-0 mb-4 text-sm font-semibold text-[#94a3b8] uppercase tracking-wider">Aksi Cepat & Variasi</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm font-medium">
              <button 
                onClick={() => setVariasi(1)}
                className={`py-3 px-4 rounded-xl transition-all border ${runningMode === 'var1' ? 'bg-[#38bdf8] text-[#0f172a] border-[#38bdf8] shadow-[0_0_15px_rgba(56,189,248,0.3)]' : 'bg-[#1e293b] text-[#f8fafc] border-white/10 hover:bg-[#334155]'}`}
              >
                Variasi 1 (1➔4)
              </button>
              <button 
                onClick={() => setVariasi(2)}
                className={`py-3 px-4 rounded-xl transition-all border ${runningMode === 'var2' ? 'bg-[#38bdf8] text-[#0f172a] border-[#38bdf8] shadow-[0_0_15px_rgba(56,189,248,0.3)]' : 'bg-[#1e293b] text-[#f8fafc] border-white/10 hover:bg-[#334155]'}`}
              >
                Variasi 2 (4➔1)
              </button>
              <button 
                onClick={() => setAllRelays(true)}
                className="py-3 px-4 rounded-xl transition-all border bg-[#1e293b] text-[#22c55e] border-white/10 hover:bg-[#22c55e]/10 hover:border-[#22c55e]/30"
              >
                Semua ON
              </button>
              <button 
                onClick={() => setAllRelays(false)}
                className="py-3 px-4 rounded-xl transition-all border bg-[#1e293b] text-[#ef4444] border-white/10 hover:bg-[#ef4444]/10 hover:border-[#ef4444]/30"
              >
                Semua OFF
              </button>
            </div>
            {runningMode !== 'none' && (
              <div className="mt-4 text-center">
                <button 
                  onClick={stopVariasi}
                  className="py-1 px-4 text-xs tracking-wider rounded-full bg-white/10 text-white hover:bg-white/20 transition-all font-semibold"
                >
                  HENTIKAN VARIASI AKTIF
                </button>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Voice Bar */}
      <div className="bg-[#1e293b] border-t border-white/10 px-6 py-5 md:px-10 flex flex-col md:flex-row items-center gap-5 shrink-0 z-10 w-full">
        <button 
          onClick={toggleListening}
          className={`w-12 h-12 rounded-full border-none flex items-center justify-center shrink-0 transition-all ${
            isListening 
              ? 'bg-[#ef4444] text-white animate-glow-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]' 
              : 'bg-[#38bdf8] text-[#0f172a] shadow-[0_0_15px_rgba(56,189,248,0.3)] hover:scale-105'
          }`}
        >
          {isListening ? <MicOff size={24} /> : <Mic size={24} />}
        </button>
        <div className="flex-1 text-center md:text-left">
          <div className={`text-[12px] font-bold mb-1 tracking-wide ${isListening ? 'text-[#ef4444]' : 'text-[#38bdf8]'}`}>
            {isListening ? 'MENDENGARKAN...' : 'KONTROL SUARA AKTIF'}
          </div>
          <div className="text-base text-[#f8fafc] opacity-80 font-medium italic min-h-[24px]">
            {transcript ? `"${transcript}"` : '"Tekan mic untuk memberi perintah"'}
          </div>
        </div>
        <div className="flex flex-wrap justify-center md:justify-end gap-2.5">
          <span className="text-[11px] py-1 px-2.5 rounded bg-[#334155] text-[#f8fafc] font-medium">"Berapa suhu?"</span>
          <span className="text-[11px] py-1 px-2.5 rounded bg-[#334155] text-[#f8fafc] font-medium">"Hidupkan relay 1"</span>
          <span className="text-[11px] py-1 px-2.5 rounded bg-[#334155] text-[#f8fafc] font-medium">"Matikan semua relay"</span>
        </div>
      </div>
    </div>
  );
}
