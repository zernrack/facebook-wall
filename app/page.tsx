"use client";

import type React from "react";

import { createClient } from "@/utils/supabase/client";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Post {
  id: string;
  user_id: string;
  body: string;
  image_url?: string;
  created_at: string;
  profiles: {
    name: string;
  };
}

interface Profile {
  id: string;
  name: string;
  location?: string;
}

export default function FacebookWall() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [message, setMessage] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPosting, setIsPosting] = useState(false);
  const [currentProfile, setCurrentProfile] = useState<Profile | null>(null);
  const [showSidebar, setShowSidebar] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Check for current profile on load
  useEffect(() => {
    const profileData = localStorage.getItem("currentProfile");
    if (!profileData) {
      router.push("/login");
      return;
    }
    try {
      const profile = JSON.parse(profileData);
      setCurrentProfile(profile);
    } catch (error) {
      console.error("Error parsing profile data:", error);
      localStorage.removeItem("currentProfile");
      router.push("/login");
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("currentProfile");
    router.push("/login");
  };

  // Function to generate avatar color based on name
  const getAvatarColor = (name: string) => {
    const colors = [
      "bg-blue-500",
      "bg-green-500",
      "bg-purple-500",
      "bg-red-500",
      "bg-yellow-500",
      "bg-indigo-500",
      "bg-pink-500",
      "bg-teal-500",
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  // Function to get initials from name
  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((word) => word.charAt(0))
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  // Function to format timestamp
  const formatTimestamp = (timestamp: string) => {
    const now = new Date();
    const postTime = new Date(timestamp);
    const diffInMinutes = Math.floor(
      (now.getTime() - postTime.getTime()) / (1000 * 60)
    );

    if (diffInMinutes < 1) return "now";
    if (diffInMinutes < 60) return `${diffInMinutes}m`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h`;
    return `${Math.floor(diffInMinutes / 1440)}d`;
  };

  // Handle image selection
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert("File size must be less than 5MB");
        return;
      }
      // Check file type
      if (!file.type.startsWith("image/")) {
        alert("Please select an image file");
        return;
      }
      setSelectedImage(file);
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Remove selected image
  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
  };

  // Upload image to Supabase Storage
  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random()
        .toString(36)
        .substring(2)}.${fileExt}`;
      const filePath = `posts/${fileName}`;

      console.log(
        "Uploading file:",
        fileName,
        "Size:",
        file.size,
        "Type:",
        file.type
      );

      const { data, error: uploadError } = await supabase.storage
        .from("wall-photos")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error("Upload error:", uploadError);
        alert(`Upload failed: ${uploadError.message}`);
        return null;
      }

      console.log("Upload successful:", data);

      // Get public URL
      const { data: urlData } = supabase.storage
        .from("wall-photos")
        .getPublicUrl(filePath);

      console.log("Public URL:", urlData.publicUrl);
      return urlData.publicUrl;
    } catch (error) {
      console.error("Error uploading image:", error);
      alert(`Upload error: ${error}`);
      return null;
    }
  };

  // Post new message
  const handlePost = async () => {
    if ((!message.trim() && !selectedImage) || isPosting || !currentProfile)
      return;

    setIsPosting(true);
    try {
      let imageUrl = null;
      // Upload image if selected
      if (selectedImage) {
        imageUrl = await uploadImage(selectedImage);
        if (!imageUrl) {
          alert("Failed to upload photo. Please try again.");
          setIsPosting(false);
          return;
        }
      }

      const { error } = await supabase.from("posts").insert([
        {
          user_id: currentProfile.id,
          body: message.trim(),
          image_url: imageUrl,
          created_at: new Date().toISOString(),
        },
      ]);

      if (error) {
        console.error("Error posting message:", error);
        return;
      }

      setMessage("");
      setSelectedImage(null);
      setImagePreview(null);
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setIsPosting(false);
    }
  };

  // Handle Enter key press
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handlePost();
    }
  };

  useEffect(() => {
    // Fetch initial posts
    const fetchPosts = async () => {
      try {
        const { data, error } = await supabase
          .from("posts")
          .select(
            `
            *,
            profiles (
              name
            )
          `
          )
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) {
          console.error("Error fetching posts:", error);
          return;
        }

        setPosts(data || []);
      } catch (error) {
        console.error("Error:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPosts();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("posts_changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "posts",
        },
        async (payload) => {
          // When a new post is inserted, fetch the complete post with profile data
          const { data: newPostData, error } = await supabase
            .from("posts")
            .select(
              `
              *,
              profiles (
                name
              )
            `
            )
            .eq("id", payload.new.id)
            .single();

          if (!error && newPostData) {
            setPosts((current) => [newPostData, ...current.slice(0, 49)]); // Keep only latest 50
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // Don't render anything if no profile (will redirect to login)
  if (!currentProfile) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Blue Header */}
      <div className="bg-[#3b5998] text-white px-2 sm:px-4 py-2 flex justify-between items-center">
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Mobile menu button */}
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="md:hidden text-white hover:bg-blue-600 p-1 rounded"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          <h1 className="text-sm sm:text-md font-normal">Wall</h1>
        </div>
        <button
          onClick={handleLogout}
          className="text-xs bg-blue-600 hover:bg-blue-700 px-2 py-1 rounded"
        >
          Logout
        </button>
      </div>

      <div className="flex relative">
        {/* Mobile Sidebar Overlay */}
        {showSidebar && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
            onClick={() => setShowSidebar(false)}
          />
        )}

        {/* Left Sidebar */}
        <div
          className={`
          ${showSidebar ? "translate-x-0" : "-translate-x-full"}
          md:translate-x-0 fixed md:static top-0 left-0 z-50 md:z-auto
          w-64 h-full md:h-auto bg-white border-r border-gray-200 p-3 sm:p-4
          transition-transform duration-300 ease-in-out
          overflow-y-auto
        `}
        >
          {/* Mobile close button */}
          <button
            onClick={() => setShowSidebar(false)}
            className="md:hidden absolute top-2 right-2 text-gray-500 hover:text-gray-700"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* Profile Photo - Avatar */}
          <div className="mb-4 mt-8 md:mt-0">
            <div
              className={`w-24 sm:w-32 h-32 sm:h-40 ${getAvatarColor(
                currentProfile.name
              )} rounded border mb-2 flex items-center justify-center mx-auto md:mx-0`}
            >
              <span className="text-white text-2xl sm:text-4xl font-bold">
                {getInitials(currentProfile.name)}
              </span>
            </div>
          </div>

          {/* Profile Info */}
          <div className="space-y-1 text-center md:text-left">
            <h2 className="text-base sm:text-lg font-bold text-black">
              {currentProfile.name}
            </h2>
            <p className="text-sm text-gray-600">Wall</p>
          </div>

          {/* Navigation Links */}
          <div className="mt-6 space-y-2">
            <div className="text-sm text-[#3b5998] cursor-pointer hover:underline">
              Information
            </div>
            <div className="text-sm font-bold text-gray-600">Current City</div>
            <div className="text-sm ml-1 text-gray-600">
              {currentProfile.location || "Not specified"}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 bg-white min-h-screen">
          {/* Status Update Box */}
          <div className="p-2 sm:p-4 border-b border-gray-200">
            <div className="flex items-start gap-2 sm:gap-3">
              <div
                className={`w-10 sm:w-12 h-10 sm:h-12 ${getAvatarColor(
                  currentProfile.name
                )} rounded flex items-center justify-center flex-shrink-0`}
              >
                <span className="text-white text-xs sm:text-sm font-bold">
                  {getInitials(currentProfile.name)}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  placeholder="What's on your mind?"
                  className="w-full p-2 border border-gray-300 rounded text-sm"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={handleKeyPress}
                  maxLength={280}
                  disabled={isPosting}
                />

                {/* Image Preview */}
                {imagePreview && (
                  <div className="mt-2 relative">
                    <Image
                      src={imagePreview || "/placeholder.svg"}
                      alt="Preview"
                      width={300}
                      height={200}
                      className="max-w-full h-auto max-h-48 rounded border object-cover"
                    />
                    <button
                      onClick={removeImage}
                      className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600"
                    >
                      ×
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between mt-1 flex-wrap gap-2">
                  <div className="text-xs text-gray-500">
                    {280 - message.length} characters remaining
                  </div>
                  {/* Photo Upload Button */}
                  <label className="cursor-pointer text-[#3b5998] hover:text-[#365899] text-sm flex items-center gap-1">
                    📷 <span className="hidden sm:inline">Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageSelect}
                      className="hidden"
                      disabled={isPosting}
                    />
                  </label>
                </div>
              </div>
              <button
                onClick={handlePost}
                disabled={(!message.trim() && !selectedImage) || isPosting}
                className="bg-gray-200 text-gray-700 px-3 sm:px-4 py-1 rounded text-sm hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              >
                {isPosting ? "Posting..." : "Share"}
              </button>
            </div>
          </div>

          {/* Wall Posts */}
          <div className="divide-y divide-gray-200">
            {isLoading ? (
              <div className="p-4 text-center text-gray-500">
                Loading posts...
              </div>
            ) : posts.length === 0 ? (
              <div className="p-4 text-center text-gray-500">
                No posts yet. Be the first to share something!
              </div>
            ) : (
              posts.map((post) => (
                <div key={post.id} className="p-2 sm:p-4">
                  <div className="flex items-start gap-2 sm:gap-3">
                    <div
                      className={`w-8 sm:w-10 h-8 sm:h-10 ${getAvatarColor(
                        post.profiles?.name || "Unknown"
                      )} rounded flex items-center justify-center flex-shrink-0`}
                    >
                      <span className="text-white text-xs sm:text-sm font-bold">
                        {getInitials(post.profiles?.name || "U")}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-bold text-[#3b5998] text-sm cursor-pointer hover:underline">
                          {post.profiles?.name || "Unknown User"}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatTimestamp(post.created_at)}
                        </span>
                      </div>
                      {post.body && (
                        <p className="text-sm text-gray-800 mb-2 break-words">
                          {post.body}
                        </p>
                      )}
                      {post.image_url && (
                        <div className="mt-2">
                          <Image
                            src={post.image_url || "/placeholder.svg"}
                            alt="Post image"
                            width={500}
                            height={400}
                            className="max-w-full h-auto max-h-96 rounded border object-cover"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
