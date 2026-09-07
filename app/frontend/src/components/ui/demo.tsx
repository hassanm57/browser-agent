import { Banner } from "@/components/ui/banner"

function RainbowBannerDemo() {
  return (
    <div className="relative w-full">
      <Banner
        message="🎉 New features coming soon!"
        height="2rem"
        variant="rainbow"
        className="mb-4"
      />

      <div className="relative w-full aspect-[16/9] rounded-lg overflow-hidden">
        <img
          src="https://cdn.21st.dev/assets/mirror/86/867a175524a0966eb144327b962159fa1ac4e1822b0cd857759b754306f3b0d4.png"
          alt="Application screenshot"
          className="object-cover w-full h-full"
        />
      </div>
    </div>
  )
}

function BannerDemo() {
  return (
    <div className="relative w-full">
      <Banner
        message="🎉 New features coming soon!"
        height="2rem"
        className="mb-4"
      />

      <div className="relative w-full aspect-[16/9] rounded-lg overflow-hidden">
        <img
          src="https://cdn.21st.dev/assets/mirror/86/867a175524a0966eb144327b962159fa1ac4e1822b0cd857759b754306f3b0d4.png"
          alt="Application screenshot"
          className="object-cover w-full h-full"
        />
      </div>
    </div>
  )
}

export { RainbowBannerDemo, BannerDemo }
