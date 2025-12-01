import { useState, useEffect } from "react";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface VoiceInputProps {
  onTranscript: (text: string) => void;
  variant?: "default" | "icon";
}

export const VoiceInput = ({ onTranscript, variant = "default" }: VoiceInputProps) => {
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        console.warn("Speech recognition not supported");
        return;
      }

      const recognitionInstance = new SpeechRecognition();
      recognitionInstance.continuous = false;
      recognitionInstance.interimResults = false;
      recognitionInstance.lang = "en-US";

      recognitionInstance.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        onTranscript(transcript);
        setIsListening(false);
      };

      recognitionInstance.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        toast.error(`Voice recognition error: ${event.error}`);
        setIsListening(false);
      };

      recognitionInstance.onend = () => {
        setIsListening(false);
      };

      setRecognition(recognitionInstance);
    }
  }, [onTranscript]);

  const toggleListening = () => {
    if (!recognition) {
      toast.error("Voice recognition not supported in your browser");
      return;
    }

    if (isListening) {
      recognition.stop();
      setIsListening(false);
    } else {
      recognition.start();
      setIsListening(true);
      toast.info("Listening... Speak now");
    }
  };

  // ---------- ICON VARIANT ----------
  if (variant === "icon") {
    return (
      <Button
        type="button"
        size="icon"
        variant={isListening ? "default" : "ghost"}
        onClick={toggleListening}
        className="transition-smooth"
      >
        {/* FIXED: Mic for ON, MicOff for OFF */}
        {isListening ? (
          <Mic className="h-4 w-4" />
        ) : (
          <MicOff className="h-4 w-4" />
        )}
      </Button>
    );
  }

  // ---------- DEFAULT BUTTON ----------
  return (
    <Button
      type="button"
      size="sm"
      variant={isListening ? "default" : "secondary"}
      onClick={toggleListening}
      className="transition-smooth"
    >
      {isListening ? (
        <>
          <Mic className="h-4 w-4 mr-2" />
          Stop
        </>
      ) : (
        <>
          <MicOff className="h-4 w-4 mr-2" />
          Voice
        </>
      )}
    </Button>
  );
};
