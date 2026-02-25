import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

const UPLOAD_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/index-document`;

interface UploadResult {
  success: boolean;
  fileName: string;
  sheetsProcessed: number;
  totalChunks: number;
  sheets: { name: string; chunks: number }[];
  message: string;
}

export const useDocumentUpload = () => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const { toast } = useToast();

  const uploadDocument = async (file: File): Promise<UploadResult | null> => {
    setIsUploading(true);
    setUploadProgress(`Uploading ${file.name}...`);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(UPLOAD_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Upload failed");
      }

      setUploadProgress("");
      toast({
        title: "Document indexed!",
        description: data.message,
      });

      return data as UploadResult;
    } catch (error) {
      console.error("Upload error:", error);
      setUploadProgress("");
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload document",
        variant: "destructive",
      });
      return null;
    } finally {
      setIsUploading(false);
    }
  };

  return { uploadDocument, isUploading, uploadProgress };
};
