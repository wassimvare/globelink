export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      achievements: {
        Row: {
          description: string | null;
          id: string;
          key: string;
          title: string;
          unlocked_at: string;
          user_id: string;
          xp: number | null;
        };
        Insert: {
          description?: string | null;
          id?: string;
          key: string;
          title: string;
          unlocked_at?: string;
          user_id: string;
          xp?: number | null;
        };
        Update: {
          description?: string | null;
          id?: string;
          key?: string;
          title?: string;
          unlocked_at?: string;
          user_id?: string;
          xp?: number | null;
        };
        Relationships: [];
      };
      activities: {
        Row: {
          category: string | null;
          cover_url: string | null;
          created_at: string;
          currency: string | null;
          description: string | null;
          destination_id: string | null;
          duration_minutes: number | null;
          id: string;
          latitude: number | null;
          longitude: number | null;
          price: number | null;
          rating: number | null;
          tags: string[] | null;
          title: string;
          updated_at: string;
        };
        Insert: {
          category?: string | null;
          cover_url?: string | null;
          created_at?: string;
          currency?: string | null;
          description?: string | null;
          destination_id?: string | null;
          duration_minutes?: number | null;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          price?: number | null;
          rating?: number | null;
          tags?: string[] | null;
          title: string;
          updated_at?: string;
        };
        Update: {
          category?: string | null;
          cover_url?: string | null;
          created_at?: string;
          currency?: string | null;
          description?: string | null;
          destination_id?: string | null;
          duration_minutes?: number | null;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          price?: number | null;
          rating?: number | null;
          tags?: string[] | null;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "activities_destination_id_fkey";
            columns: ["destination_id"];
            isOneToOne: false;
            referencedRelation: "destinations";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_audit_log: {
        Row: {
          action: string;
          actor_id: string;
          created_at: string;
          id: string;
          metadata: Json;
          target_id: string | null;
          target_type: string | null;
        };
        Insert: {
          action: string;
          actor_id: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          target_id?: string | null;
          target_type?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string;
          created_at?: string;
          id?: string;
          metadata?: Json;
          target_id?: string | null;
          target_type?: string | null;
        };
        Relationships: [];
      };
      ai_usage: {
        Row: {
          created_at: string;
          feature: string;
          id: number;
          mode: string | null;
          query_chars: number;
          source_count: number;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          feature: string;
          id?: never;
          mode?: string | null;
          query_chars?: number;
          source_count?: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          feature?: string;
          id?: never;
          mode?: string | null;
          query_chars?: number;
          source_count?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      announcements: {
        Row: {
          audience: string;
          author_id: string | null;
          body: string;
          created_at: string;
          expires_at: string | null;
          id: string;
          published_at: string | null;
          severity: string;
          title: string;
          updated_at: string;
        };
        Insert: {
          audience?: string;
          author_id?: string | null;
          body: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          published_at?: string | null;
          severity?: string;
          title: string;
          updated_at?: string;
        };
        Update: {
          audience?: string;
          author_id?: string | null;
          body?: string;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          published_at?: string | null;
          severity?: string;
          title?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      badges: {
        Row: {
          created_at: string;
          description: string;
          emoji: string;
          id: string;
          label: string;
        };
        Insert: {
          created_at?: string;
          description: string;
          emoji: string;
          id: string;
          label: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          emoji?: string;
          id?: string;
          label?: string;
        };
        Relationships: [];
      };
      comment_likes: {
        Row: {
          comment_id: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          comment_id: string;
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          comment_id?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
        ];
      };
      comments: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          parent_id: string | null;
          post_id: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          parent_id?: string | null;
          post_id: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          parent_id?: string | null;
          post_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "comments_user_id_profiles_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      community_answers: {
        Row: {
          author_id: string;
          content: string;
          created_at: string;
          id: string;
          question_id: string;
          updated_at: string;
        };
        Insert: {
          author_id: string;
          content: string;
          created_at?: string;
          id?: string;
          question_id: string;
          updated_at?: string;
        };
        Update: {
          author_id?: string;
          content?: string;
          created_at?: string;
          id?: string;
          question_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "community_answers_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "community_answers_question_id_fkey";
            columns: ["question_id"];
            isOneToOne: false;
            referencedRelation: "community_questions";
            referencedColumns: ["id"];
          },
        ];
      };
      community_questions: {
        Row: {
          author_id: string | null;
          author_username: string;
          body: string | null;
          country: string;
          created_at: string;
          id: string;
          slug: string;
          title: string;
          updated_at: string;
          votes: number;
        };
        Insert: {
          author_id?: string | null;
          author_username?: string;
          body?: string | null;
          country: string;
          created_at?: string;
          id?: string;
          slug: string;
          title: string;
          updated_at?: string;
          votes?: number;
        };
        Update: {
          author_id?: string | null;
          author_username?: string;
          body?: string | null;
          country?: string;
          created_at?: string;
          id?: string;
          slug?: string;
          title?: string;
          updated_at?: string;
          votes?: number;
        };
        Relationships: [
          {
            foreignKeyName: "community_questions_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_participants: {
        Row: {
          conversation_id: string;
          joined_at: string;
          last_read_at: string;
          user_id: string;
        };
        Insert: {
          conversation_id: string;
          joined_at?: string;
          last_read_at?: string;
          user_id: string;
        };
        Update: {
          conversation_id?: string;
          joined_at?: string;
          last_read_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          created_at: string;
          id: string;
          last_message_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last_message_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_message_at?: string;
        };
        Relationships: [];
      };
      destinations: {
        Row: {
          city: string | null;
          country: string;
          cover_url: string | null;
          created_at: string;
          description: string | null;
          id: string;
          latitude: number | null;
          longitude: number | null;
          name: string;
          popularity: number | null;
          rating: number | null;
          slug: string;
          summary: string | null;
          tags: string[] | null;
          updated_at: string;
        };
        Insert: {
          city?: string | null;
          country: string;
          cover_url?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          name: string;
          popularity?: number | null;
          rating?: number | null;
          slug: string;
          summary?: string | null;
          tags?: string[] | null;
          updated_at?: string;
        };
        Update: {
          city?: string | null;
          country?: string;
          cover_url?: string | null;
          created_at?: string;
          description?: string | null;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          name?: string;
          popularity?: number | null;
          rating?: number | null;
          slug?: string;
          summary?: string | null;
          tags?: string[] | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      follows: {
        Row: {
          created_at: string;
          follower_id: string;
          following_id: string;
        };
        Insert: {
          created_at?: string;
          follower_id: string;
          following_id: string;
        };
        Update: {
          created_at?: string;
          follower_id?: string;
          following_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey";
            columns: ["follower_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "follows_following_id_fkey";
            columns: ["following_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      match_group_members: {
        Row: {
          group_id: string;
          joined_at: string;
          user_id: string;
        };
        Insert: {
          group_id: string;
          joined_at?: string;
          user_id: string;
        };
        Update: {
          group_id?: string;
          joined_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "match_group_members_group_id_fkey";
            columns: ["group_id"];
            isOneToOne: false;
            referencedRelation: "match_groups";
            referencedColumns: ["id"];
          },
        ];
      };
      match_groups: {
        Row: {
          conversation_id: string | null;
          created_at: string;
          destination_country: string | null;
          ends_on: string | null;
          id: string;
          name: string;
          owner_id: string;
          starts_on: string | null;
        };
        Insert: {
          conversation_id?: string | null;
          created_at?: string;
          destination_country?: string | null;
          ends_on?: string | null;
          id?: string;
          name: string;
          owner_id: string;
          starts_on?: string | null;
        };
        Update: {
          conversation_id?: string | null;
          created_at?: string;
          destination_country?: string | null;
          ends_on?: string | null;
          id?: string;
          name?: string;
          owner_id?: string;
          starts_on?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "match_groups_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      match_likes: {
        Row: {
          created_at: string;
          from_user_id: string;
          id: string;
          to_user_id: string;
        };
        Insert: {
          created_at?: string;
          from_user_id: string;
          id?: string;
          to_user_id: string;
        };
        Update: {
          created_at?: string;
          from_user_id?: string;
          id?: string;
          to_user_id?: string;
        };
        Relationships: [];
      };
      match_passes: {
        Row: {
          created_at: string;
          id: string;
          target_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          target_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          target_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "match_passes_target_id_fkey";
            columns: ["target_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "match_passes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          attachment_meta: Json | null;
          attachment_type: string | null;
          attachment_url: string | null;
          content: string | null;
          conversation_id: string;
          created_at: string;
          id: string;
          sender_id: string;
        };
        Insert: {
          attachment_meta?: Json | null;
          attachment_type?: string | null;
          attachment_url?: string | null;
          content?: string | null;
          conversation_id: string;
          created_at?: string;
          id?: string;
          sender_id: string;
        };
        Update: {
          attachment_meta?: Json | null;
          attachment_type?: string | null;
          attachment_url?: string | null;
          content?: string | null;
          conversation_id?: string;
          created_at?: string;
          id?: string;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_id_fkey";
            columns: ["sender_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          actor_id: string | null;
          comment_id: string | null;
          created_at: string;
          id: string;
          message_id: string | null;
          metadata: Json | null;
          post_id: string | null;
          read_at: string | null;
          recipient_id: string;
          type: Database["public"]["Enums"]["notification_type"];
        };
        Insert: {
          actor_id?: string | null;
          comment_id?: string | null;
          created_at?: string;
          id?: string;
          message_id?: string | null;
          metadata?: Json | null;
          post_id?: string | null;
          read_at?: string | null;
          recipient_id: string;
          type: Database["public"]["Enums"]["notification_type"];
        };
        Update: {
          actor_id?: string | null;
          comment_id?: string | null;
          created_at?: string;
          id?: string;
          message_id?: string | null;
          metadata?: Json | null;
          post_id?: string | null;
          read_at?: string | null;
          recipient_id?: string;
          type?: Database["public"]["Enums"]["notification_type"];
        };
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_comment_id_fkey";
            columns: ["comment_id"];
            isOneToOne: false;
            referencedRelation: "comments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      places: {
        Row: {
          category: string;
          city: string | null;
          country: string;
          created_at: string;
          description: string | null;
          id: string;
          image_url: string | null;
          lat: number;
          lng: number;
          moderation_ai_checked_at: string | null;
          moderation_ai_flags: string[];
          moderation_ai_score: number | null;
          moderation_ai_summary: string | null;
          moderation_rejection_reason: string | null;
          moderation_reviewed_at: string | null;
          moderation_reviewed_by: string | null;
          moderation_status: string;
          name: string;
          user_id: string;
        };
        Insert: {
          category: string;
          city?: string | null;
          country: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          lat: number;
          lng: number;
          moderation_ai_checked_at?: string | null;
          moderation_ai_flags?: string[];
          moderation_ai_score?: number | null;
          moderation_ai_summary?: string | null;
          moderation_rejection_reason?: string | null;
          moderation_reviewed_at?: string | null;
          moderation_reviewed_by?: string | null;
          moderation_status?: string;
          name: string;
          user_id: string;
        };
        Update: {
          category?: string;
          city?: string | null;
          country?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          lat?: number;
          lng?: number;
          moderation_ai_checked_at?: string | null;
          moderation_ai_flags?: string[];
          moderation_ai_score?: number | null;
          moderation_ai_summary?: string | null;
          moderation_rejection_reason?: string | null;
          moderation_reviewed_at?: string | null;
          moderation_reviewed_by?: string | null;
          moderation_status?: string;
          name?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "places_user_id_profiles_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      post_likes: {
        Row: {
          created_at: string;
          post_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          post_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          post_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      post_media: {
        Row: {
          created_at: string;
          id: string;
          media_chunks: string[] | null;
          media_mime_type: string | null;
          media_size_bytes: number | null;
          media_type: string;
          position: number;
          post_id: string;
          url: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          media_chunks?: string[] | null;
          media_mime_type?: string | null;
          media_size_bytes?: number | null;
          media_type?: string;
          position?: number;
          post_id: string;
          url: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          media_chunks?: string[] | null;
          media_mime_type?: string | null;
          media_size_bytes?: number | null;
          media_type?: string;
          position?: number;
          post_id?: string;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_media_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      post_reactions: {
        Row: {
          created_at: string;
          id: string;
          post_id: string;
          reaction: Database["public"]["Enums"]["reaction_type"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          post_id: string;
          reaction: Database["public"]["Enums"]["reaction_type"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          post_id?: string;
          reaction?: Database["public"]["Enums"]["reaction_type"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_reactions_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      post_saves: {
        Row: {
          created_at: string;
          post_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          post_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          post_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "post_saves_post_id_fkey";
            columns: ["post_id"];
            isOneToOne: false;
            referencedRelation: "posts";
            referencedColumns: ["id"];
          },
        ];
      };
      posts: {
        Row: {
          activity: string | null;
          caption: string | null;
          city: string | null;
          country: string | null;
          created_at: string;
          hashtags: string[];
          id: string;
          image_url: string;
          lat: number | null;
          lng: number | null;
          user_id: string;
          video_url: string | null;
        };
        Insert: {
          activity?: string | null;
          caption?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          hashtags?: string[];
          id?: string;
          image_url: string;
          lat?: number | null;
          lng?: number | null;
          user_id: string;
          video_url?: string | null;
        };
        Update: {
          activity?: string | null;
          caption?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          hashtags?: string[];
          id?: string;
          image_url?: string;
          lat?: number | null;
          lng?: number | null;
          user_id?: string;
          video_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "posts_user_id_profiles_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      product_favorites: {
        Row: {
          created_at: string;
          id: string;
          product_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          product_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          product_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_favorites_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      product_reviews: {
        Row: {
          content: string | null;
          created_at: string;
          id: string;
          product_id: string;
          rating: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content?: string | null;
          created_at?: string;
          id?: string;
          product_id: string;
          rating: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content?: string | null;
          created_at?: string;
          id?: string;
          product_id?: string;
          rating?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "product_reviews_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          cover_url: string | null;
          created_at: string;
          currency: string;
          description: string | null;
          external_url: string | null;
          favorites_count: number;
          id: string;
          is_published: boolean;
          price_cents: number;
          rating_avg: number;
          rating_count: number;
          seller_id: string;
          tags: string[];
          title: string;
          type: Database["public"]["Enums"]["product_type"];
          updated_at: string;
        };
        Insert: {
          cover_url?: string | null;
          created_at?: string;
          currency?: string;
          description?: string | null;
          external_url?: string | null;
          favorites_count?: number;
          id?: string;
          is_published?: boolean;
          price_cents?: number;
          rating_avg?: number;
          rating_count?: number;
          seller_id: string;
          tags?: string[];
          title: string;
          type: Database["public"]["Enums"]["product_type"];
          updated_at?: string;
        };
        Update: {
          cover_url?: string | null;
          created_at?: string;
          currency?: string;
          description?: string | null;
          external_url?: string | null;
          favorites_count?: number;
          id?: string;
          is_published?: boolean;
          price_cents?: number;
          rating_avg?: number;
          rating_count?: number;
          seller_id?: string;
          tags?: string[];
          title?: string;
          type?: Database["public"]["Enums"]["product_type"];
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          banner_url: string | null;
          bio: string | null;
          birth_date: string | null;
          city: string | null;
          country: string | null;
          created_at: string;
          display_name: string | null;
          email_verified_at: string | null;
          followers_count: number;
          following_count: number;
          id: string;
          instagram: string | null;
          interests: string[];
          visibility: string;
          verified: boolean;
          featured: boolean;
          ai_access: string;
          ai_daily_limit: number;
          languages: string[] | null;
          status: string;
          status_reason: string | null;
          status_updated_at: string | null;
          tiktok: string | null;
          travel_style: string | null;
          updated_at: string;
          username: string;
          visited_countries: string[] | null;
          website_url: string | null;
          x_handle: string | null;
          youtube: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          banner_url?: string | null;
          bio?: string | null;
          birth_date?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          display_name?: string | null;
          email_verified_at?: string | null;
          followers_count?: number;
          following_count?: number;
          id: string;
          instagram?: string | null;
          interests?: string[];
          visibility?: string;
          verified?: boolean;
          featured?: boolean;
          ai_access?: string;
          ai_daily_limit?: number;
          languages?: string[] | null;
          status?: string;
          status_reason?: string | null;
          status_updated_at?: string | null;
          tiktok?: string | null;
          travel_style?: string | null;
          updated_at?: string;
          username: string;
          visited_countries?: string[] | null;
          website_url?: string | null;
          x_handle?: string | null;
          youtube?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          banner_url?: string | null;
          bio?: string | null;
          birth_date?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          display_name?: string | null;
          email_verified_at?: string | null;
          followers_count?: number;
          following_count?: number;
          id?: string;
          instagram?: string | null;
          interests?: string[];
          visibility?: string;
          verified?: boolean;
          featured?: boolean;
          ai_access?: string;
          ai_daily_limit?: number;
          languages?: string[] | null;
          status?: string;
          status_reason?: string | null;
          status_updated_at?: string | null;
          tiktok?: string | null;
          travel_style?: string | null;
          updated_at?: string;
          username?: string;
          visited_countries?: string[] | null;
          website_url?: string | null;
          x_handle?: string | null;
          youtube?: string | null;
        };
        Relationships: [];
      };
      purchases: {
        Row: {
          buyer_id: string;
          created_at: string;
          currency: string;
          download_url: string | null;
          id: string;
          price_paid: number;
          product_id: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          buyer_id: string;
          created_at?: string;
          currency?: string;
          download_url?: string | null;
          id?: string;
          price_paid?: number;
          product_id: string;
          status?: string;
          updated_at?: string;
        };
        Update: {
          buyer_id?: string;
          created_at?: string;
          currency?: string;
          download_url?: string | null;
          id?: string;
          price_paid?: number;
          product_id?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "purchases_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      reports: {
        Row: {
          created_at: string;
          details: string | null;
          id: string;
          reason: string;
          reporter_id: string;
          resolution_note: string | null;
          resolved_at: string | null;
          resolved_by: string | null;
          status: string;
          target_id: string;
          target_type: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          details?: string | null;
          id?: string;
          reason: string;
          reporter_id: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
          target_id: string;
          target_type: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          details?: string | null;
          id?: string;
          reason?: string;
          reporter_id?: string;
          resolution_note?: string | null;
          resolved_at?: string | null;
          resolved_by?: string | null;
          status?: string;
          target_id?: string;
          target_type?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      stories: {
        Row: {
          caption: string | null;
          city: string | null;
          country: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          media_chunks: string[] | null;
          media_mime_type: string | null;
          media_size_bytes: number | null;
          media_type: string;
          media_url: string;
          poster_url: string | null;
          segment_count: number;
          segment_end_seconds: number | null;
          segment_index: number;
          segment_start_seconds: number;
          story_group_id: string | null;
          user_id: string;
          video_duration_seconds: number | null;
        };
        Insert: {
          caption?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          media_chunks?: string[] | null;
          media_mime_type?: string | null;
          media_size_bytes?: number | null;
          media_type?: string;
          media_url: string;
          poster_url?: string | null;
          segment_count?: number;
          segment_end_seconds?: number | null;
          segment_index?: number;
          segment_start_seconds?: number;
          story_group_id?: string | null;
          user_id: string;
          video_duration_seconds?: number | null;
        };
        Update: {
          caption?: string | null;
          city?: string | null;
          country?: string | null;
          created_at?: string;
          expires_at?: string;
          id?: string;
          media_chunks?: string[] | null;
          media_mime_type?: string | null;
          media_size_bytes?: number | null;
          media_type?: string;
          media_url?: string;
          poster_url?: string | null;
          segment_count?: number;
          segment_end_seconds?: number | null;
          segment_index?: number;
          segment_start_seconds?: number;
          story_group_id?: string | null;
          user_id?: string;
          video_duration_seconds?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "stories_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      story_likes: {
        Row: {
          created_at: string;
          id: string;
          story_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          story_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          story_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "story_likes_story_id_fkey";
            columns: ["story_id"];
            isOneToOne: false;
            referencedRelation: "stories";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "story_likes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      travel_intents: {
        Row: {
          bio: string | null;
          budget_eur: number | null;
          created_at: string;
          destination_city: string | null;
          destination_country: string;
          ends_on: string;
          id: string;
          interests: string[];
          languages: string[];
          starts_on: string;
          travel_style: string | null;
          travelers: number;
          updated_at: string;
          user_id: string;
          visibility: string;
        };
        Insert: {
          bio?: string | null;
          budget_eur?: number | null;
          created_at?: string;
          destination_city?: string | null;
          destination_country: string;
          ends_on: string;
          id?: string;
          interests?: string[];
          languages?: string[];
          starts_on: string;
          travel_style?: string | null;
          travelers?: number;
          updated_at?: string;
          user_id: string;
          visibility?: string;
        };
        Update: {
          bio?: string | null;
          budget_eur?: number | null;
          created_at?: string;
          destination_city?: string | null;
          destination_country?: string;
          ends_on?: string;
          id?: string;
          interests?: string[];
          languages?: string[];
          starts_on?: string;
          travel_style?: string | null;
          travelers?: number;
          updated_at?: string;
          user_id?: string;
          visibility?: string;
        };
        Relationships: [];
      };
      trip_days: {
        Row: {
          created_at: string;
          day_date: string;
          headline: string | null;
          id: string;
          mood: string | null;
          notes: string | null;
          trip_id: string;
          updated_at: string;
          user_id: string;
          weather_icon: string | null;
          weather_summary: string | null;
          weather_temp: number | null;
        };
        Insert: {
          created_at?: string;
          day_date: string;
          headline?: string | null;
          id?: string;
          mood?: string | null;
          notes?: string | null;
          trip_id: string;
          updated_at?: string;
          user_id: string;
          weather_icon?: string | null;
          weather_summary?: string | null;
          weather_temp?: number | null;
        };
        Update: {
          created_at?: string;
          day_date?: string;
          headline?: string | null;
          id?: string;
          mood?: string | null;
          notes?: string | null;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
          weather_icon?: string | null;
          weather_summary?: string | null;
          weather_temp?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "trip_days_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_entries: {
        Row: {
          city: string | null;
          country: string | null;
          created_at: string;
          id: string;
          image_url: string | null;
          kind: string;
          lat: number | null;
          lng: number | null;
          media_urls: string[];
          notes: string | null;
          position: number;
          price_level: number | null;
          rating: number | null;
          starts_at: string | null;
          title: string;
          trip_id: string;
          updated_at: string;
          user_id: string;
          video_url: string | null;
          visited_on: string | null;
        };
        Insert: {
          city?: string | null;
          country?: string | null;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          kind?: string;
          lat?: number | null;
          lng?: number | null;
          media_urls?: string[];
          notes?: string | null;
          position?: number;
          price_level?: number | null;
          rating?: number | null;
          starts_at?: string | null;
          title: string;
          trip_id: string;
          updated_at?: string;
          user_id: string;
          video_url?: string | null;
          visited_on?: string | null;
        };
        Update: {
          city?: string | null;
          country?: string | null;
          created_at?: string;
          id?: string;
          image_url?: string | null;
          kind?: string;
          lat?: number | null;
          lng?: number | null;
          media_urls?: string[];
          notes?: string | null;
          position?: number;
          price_level?: number | null;
          rating?: number | null;
          starts_at?: string | null;
          title?: string;
          trip_id?: string;
          updated_at?: string;
          user_id?: string;
          video_url?: string | null;
          visited_on?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "trip_entries_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trip_expenses: {
        Row: {
          amount: number;
          category: string | null;
          created_at: string;
          currency: string;
          id: string;
          label: string;
          spent_on: string | null;
          trip_id: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          category?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          label: string;
          spent_on?: string | null;
          trip_id: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          category?: string | null;
          created_at?: string;
          currency?: string;
          id?: string;
          label?: string;
          spent_on?: string | null;
          trip_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_expenses_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
        ];
      };
      trips: {
        Row: {
          budget: number | null;
          city: string | null;
          country: string;
          cover_url: string | null;
          created_at: string;
          ends_on: string | null;
          finalized_at: string | null;
          id: string;
          notes: string | null;
          souvenir_url: string | null;
          starts_on: string | null;
          stats: Json | null;
          status: string;
          summary: string | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          budget?: number | null;
          city?: string | null;
          country: string;
          cover_url?: string | null;
          created_at?: string;
          ends_on?: string | null;
          finalized_at?: string | null;
          id?: string;
          notes?: string | null;
          souvenir_url?: string | null;
          starts_on?: string | null;
          stats?: Json | null;
          status?: string;
          summary?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          budget?: number | null;
          city?: string | null;
          country?: string;
          cover_url?: string | null;
          created_at?: string;
          ends_on?: string | null;
          finalized_at?: string | null;
          id?: string;
          notes?: string | null;
          souvenir_url?: string | null;
          starts_on?: string | null;
          stats?: Json | null;
          status?: string;
          summary?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_badges: {
        Row: {
          badge_id: string;
          earned_at: string;
          user_id: string;
        };
        Insert: {
          badge_id: string;
          earned_at?: string;
          user_id: string;
        };
        Update: {
          badge_id?: string;
          earned_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_badges_badge_id_fkey";
            columns: ["badge_id"];
            isOneToOne: false;
            referencedRelation: "badges";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          granted_by: string | null;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          granted_by?: string | null;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          granted_by?: string | null;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_set_ai_pro_grant: {
        Args: {
          p_action: string;
          p_duration_days?: number;
          p_note?: string | null;
          p_user_id: string;
        };
        Returns: Json;
      };
      has_active_ai_pro_access: { Args: { p_user_id?: string }; Returns: boolean };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_admin: { Args: { _user_id: string }; Returns: boolean };
      is_conversation_participant: {
        Args: { _conv: string; _user: string };
        Returns: boolean;
      };
      get_visible_stories: {
        Args: Record<PropertyKey, never>;
        Returns: {
          avatar_url: string | null;
          city: string | null;
          country: string | null;
          created_at: string;
          expires_at: string;
          id: string;
          media_chunks: string[] | null;
          media_mime_type: string | null;
          media_size_bytes: number | null;
          media_type: string;
          media_url: string;
          poster_url: string | null;
          segment_count: number;
          segment_end_seconds: number | null;
          segment_index: number;
          segment_start_seconds: number;
          story_group_id: string | null;
          user_id: string;
          username: string;
          video_duration_seconds: number | null;
        }[];
      };
      is_match_group_member: {
        Args: { _group: string; _user: string };
        Returns: boolean;
      };
      is_moderator_or_admin: { Args: { _user_id: string }; Returns: boolean };
      open_or_create_direct_conversation: {
        Args: { _other_user_id: string };
        Returns: string;
      };
      reserve_free_ai_usage: {
        Args: { p_feature: string; p_mode: string; p_query_chars: number };
        Returns: number;
      };
      send_match_like: {
        Args: { _from_user_id: string; _to_user_id: string };
        Returns: {
          conversation_id: string;
          matched: boolean;
        }[];
      };
    };
    Enums: {
      app_role: "user" | "moderator" | "admin";
      notification_type:
        | "like"
        | "comment"
        | "reply"
        | "follow"
        | "mention"
        | "message"
        | "reaction"
        | "story_like"
        | "place_approved"
        | "place_rejected";
      product_type: "guide_pdf" | "itineraire" | "preset" | "ebook" | "accompagnement";
      reaction_type: "love" | "wow" | "haha" | "fire" | "wanderlust" | "sad";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["user", "moderator", "admin"],
      notification_type: [
        "like",
        "comment",
        "reply",
        "follow",
        "mention",
        "message",
        "reaction",
        "story_like",
        "place_approved",
        "place_rejected",
      ],
      product_type: ["guide_pdf", "itineraire", "preset", "ebook", "accompagnement"],
      reaction_type: ["love", "wow", "haha", "fire", "wanderlust", "sad"],
    },
  },
} as const;
