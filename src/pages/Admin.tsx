import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { VoiceInput } from "@/components/VoiceInput";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Home, Loader2 } from "lucide-react";

const Admin = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updates, setUpdates] = useState<any[]>([]);

  useEffect(() => {
    fetchUpdates();
  }, []);

  const fetchUpdates = async () => {
    const { data, error } = await supabase
      .from("updates")
      .select("*")
      .order("date", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Error fetching updates:", error);
      toast.error("Failed to load updates");
    } else {
      setUpdates(data || []);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title || !description) {
      toast.error("Please fill in title & description");
      return;
    }

    setIsSubmitting(true);

    try {
      // Auto-generate date & time
      const now = new Date();
      const autoDate = format(now, "yyyy-MM-dd");
      const autoTime = now.toTimeString().slice(0, 5); // HH:MM

      // Insert into Supabase
      const { error: dbError } = await supabase
        .from("updates")
        .insert({
          date: autoDate,
          title,
          description,
          time: autoTime,
        });

      if (dbError) throw dbError;

      // Call Google Sheets sync
      const { error: sheetError } = await supabase.functions.invoke("addToSheet", {
        body: {
          date: autoDate,
          title,
          description,
          time: autoTime,
        },
      });

      if (sheetError) {
        console.error("Google Sheets error:", sheetError);
        toast.warning("Saved to database, but Sheets sync failed");
      }

      toast.success("Update added!");

      // Reset form
      setTitle("");
      setDescription("");

      // Refresh table
      fetchUpdates();
    } catch (error: any) {
      console.error("Error adding update:", error);
      toast.error(error.message || "Failed to add update");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen gradient-subtle p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-4xl font-heading font-bold">Admin Panel</h1>
          <Button variant="ghost" onClick={() => navigate("/")}>
            <Home className="h-5 w-5 mr-2" />
            Home
          </Button>
        </div>

        <div className="bg-card shadow-soft rounded-2xl p-6 md:p-8 border border-border mb-8">
          <h2 className="text-2xl font-heading font-bold mb-6">Add New Update</h2>

          <form onSubmit={handleSubmit} className="space-y-6">

            <div className="space-y-2">
              <label className="text-sm font-medium">Title</label>
              <div className="flex gap-2">
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Enter update title"
                  className="flex-1"
                />
                <VoiceInput onTranscript={setTitle} variant="icon" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Description</label>
              <div className="flex gap-2 items-start">
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter update description"
                  rows={4}
                  className="flex-1"
                />
                <VoiceInput onTranscript={setDescription} variant="icon" />
              </div>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full gradient-primary text-primary-foreground font-semibold shadow-glow hover:opacity-90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding Update...
                </>
              ) : (
                "Add Update"
              )}
            </Button>
          </form>
        </div>

        <div className="bg-card shadow-soft rounded-2xl p-6 md:p-8 border border-border">
          <h2 className="text-2xl font-heading font-bold mb-6">Recent Updates (Last 20)</h2>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Description</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {updates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground">
                      No updates yet. Add your first update above!
                    </TableCell>
                  </TableRow>
                ) : (
                  updates.map((update) => (
                    <TableRow key={update.id}>
                      <TableCell className="font-medium">
                        {format(new Date(update.date), "MMM dd, yyyy")}
                      </TableCell>
                      <TableCell>{update.time}</TableCell>
                      <TableCell>{update.title}</TableCell>
                      <TableCell className="max-w-md truncate">
                        {update.description}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Admin;
