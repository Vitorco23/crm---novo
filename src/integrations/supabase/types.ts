export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_router_logs: {
        Row: {
          attempt_index: number
          created_at: string
          error_type: string | null
          fallback_reason: string | null
          id: string
          input_chars: number
          latency_ms: number
          model: string
          success: boolean
          task: string
        }
        Insert: {
          attempt_index?: number
          created_at?: string
          error_type?: string | null
          fallback_reason?: string | null
          id?: string
          input_chars?: number
          latency_ms?: number
          model: string
          success: boolean
          task: string
        }
        Update: {
          attempt_index?: number
          created_at?: string
          error_type?: string | null
          fallback_reason?: string | null
          id?: string
          input_chars?: number
          latency_ms?: number
          model?: string
          success?: boolean
          task?: string
        }
        Relationships: []
      }
      commercial_memory: {
        Row: {
          approved: boolean
          confidence: number
          content: string
          created_at: string
          embedding: string
          id: string
          kind: string
          metadata: Json
          source_lead_id: string | null
          title: string
          updated_at: string
          usage_count: number
        }
        Insert: {
          approved?: boolean
          confidence?: number
          content: string
          created_at?: string
          embedding: string
          id?: string
          kind: string
          metadata?: Json
          source_lead_id?: string | null
          title: string
          updated_at?: string
          usage_count?: number
        }
        Update: {
          approved?: boolean
          confidence?: number
          content?: string
          created_at?: string
          embedding?: string
          id?: string
          kind?: string
          metadata?: Json
          source_lead_id?: string | null
          title?: string
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      intel_conversations: {
        Row: {
          created_at: string
          id: string
          owner_email: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_email?: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_email?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      intel_messages: {
        Row: {
          citations: Json | null
          content: string
          context_snapshot: Json | null
          conversation_id: string
          created_at: string
          id: string
          model_used: string | null
          role: string
          specialist: string | null
        }
        Insert: {
          citations?: Json | null
          content: string
          context_snapshot?: Json | null
          conversation_id: string
          created_at?: string
          id?: string
          model_used?: string | null
          role: string
          specialist?: string | null
        }
        Update: {
          citations?: Json | null
          content?: string
          context_snapshot?: Json | null
          conversation_id?: string
          created_at?: string
          id?: string
          model_used?: string | null
          role?: string
          specialist?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "intel_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "intel_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      interactions_inbound: {
        Row: {
          call_id: string | null
          created_at: string
          dados: Json
          id: string
          phone_normalized: string | null
          processed: boolean
          processed_at: string | null
        }
        Insert: {
          call_id?: string | null
          created_at?: string
          dados: Json
          id?: string
          phone_normalized?: string | null
          processed?: boolean
          processed_at?: string | null
        }
        Update: {
          call_id?: string | null
          created_at?: string
          dados?: Json
          id?: string
          phone_normalized?: string | null
          processed?: boolean
          processed_at?: string | null
        }
        Relationships: []
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string
          id: string
          metadata: Json
        }
        Insert: {
          chunk_index: number
          content: string
          created_at?: string
          document_id: string
          embedding: string
          id?: string
          metadata?: Json
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_document_versions: {
        Row: {
          categoria: string
          conteudo_markdown: string
          created_at: string
          descricao: string | null
          document_id: string
          id: string
          tags: string[]
          titulo: string
          versao: number
        }
        Insert: {
          categoria: string
          conteudo_markdown: string
          created_at?: string
          descricao?: string | null
          document_id: string
          id?: string
          tags?: string[]
          titulo: string
          versao: number
        }
        Update: {
          categoria?: string
          conteudo_markdown?: string
          created_at?: string
          descricao?: string | null
          document_id?: string
          id?: string
          tags?: string[]
          titulo?: string
          versao?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          ativo: boolean
          categoria: string
          conteudo_markdown: string
          created_at: string
          descricao: string | null
          id: string
          owner_email: string
          tags: string[]
          titulo: string
          updated_at: string
          versao: number
        }
        Insert: {
          ativo?: boolean
          categoria: string
          conteudo_markdown?: string
          created_at?: string
          descricao?: string | null
          id?: string
          owner_email?: string
          tags?: string[]
          titulo: string
          updated_at?: string
          versao?: number
        }
        Update: {
          ativo?: boolean
          categoria?: string
          conteudo_markdown?: string
          created_at?: string
          descricao?: string | null
          id?: string
          owner_email?: string
          tags?: string[]
          titulo?: string
          updated_at?: string
          versao?: number
        }
        Relationships: []
      }
      leads_inbound: {
        Row: {
          created_at: string
          dados: Json
          id: string
        }
        Insert: {
          created_at?: string
          dados: Json
          id?: string
        }
        Update: {
          created_at?: string
          dados?: Json
          id?: string
        }
        Relationships: []
      }
      user_storage: {
        Row: {
          key: string
          updated_at: string
          user_id: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          user_id: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          user_id?: string
          value?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      match_commercial_memory: {
        Args: {
          filter_kind?: string
          filter_niche?: string
          match_count?: number
          min_similarity?: number
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          kind: string
          metadata: Json
          similarity: number
          title: string
          usage_count: number
        }[]
      }
      match_knowledge_chunks: {
        Args: {
          filter_categoria?: string
          match_count?: number
          min_similarity?: number
          query_embedding: string
        }
        Returns: {
          categoria: string
          chunk_id: string
          chunk_index: number
          content: string
          document_id: string
          similarity: number
          titulo: string
          versao: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
