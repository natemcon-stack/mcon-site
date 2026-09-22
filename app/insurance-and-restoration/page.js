import ServicePage from "@/components/ServicePage";

export const metadata = {
  title: "Insurance restoration — flooding and water damage",
  description:
    "Water removal, documented moisture testing and full subtrade coordination after an insurance claim in Powell River and the qathet region.",
};

export default function Page() {
  return (
    <ServicePage
      title="Restoration after an insurance claim"
      lede="Flooding, water damage and the rebuild that follows."
      photos={[
        {
          src: "/images/restoration-1.jpg",
          alt: "Flood water and mud across a vinyl plank floor in a Westview home",
          caption:
            "Emergency clean-up the night it happened. Powell River took several inches of rain in about fifteen minutes, and we worked from nine at night into the small hours.",
        },
        {
          src: "/images/restoration-2.jpg",
          alt: "An air mover and dehumidifier running in a stripped room during drying",
          caption:
            "Drying equipment running after the affected materials came out.",
        },
        {
          src: "/images/restoration-3.jpg",
          alt: "Flooring lifted and drying equipment set up in a flooded kitchen",
          caption:
            "Flooring lifted. With Category 3 water, anything porous it touched has to go.",
        },
      ]}
    >
      <p>
        We handle the work end to end: water removal, documented moisture testing through
        to the space being confirmed dry, and coordination of all subtrades — hazardous
        materials testing, flooring, appliances, electrical — so you&apos;re not chasing
        four contractors while living in a damaged home.
      </p>

      <h2>Working with your insurer</h2>
      <p>
        We work with whoever your insurer is. We&apos;re not on insurer preferred vendor
        lists, because we don&apos;t use Xactimate estimating software — but we&apos;re
        happy to price competitively against the contractors who are, and you&apos;ll get
        an itemised invoice and damage report your adjuster can read.
      </p>
      <p>
        Insurance companies often require multiple quotes. Other than us, your options
        locally are SJS Restorations — we have nothing but good things to say about Jim
        and his crew — or Edeo Restorations, formerly WinMar Powell River, who have all
        the skills required.
      </p>

      <h2>After-hours work</h2>
      <p>
        We take on emergency and restoration work, but we can&apos;t guarantee after-hours
        availability. After-hours call-outs are billed at a minimum two hours at $150 per
        man hour.
      </p>

      <h2>What happened here</h2>
      <p>
        Powell River took several inches of rain in a fifteen-minute period. At this
        Westview home, water came in the front door and filled an abandoned soap box at
        the back of the house. There was an unsealed opening where a pipe ran from the
        floor joist space into that box, and with more than a foot of water standing above
        it, the water forced its way into the downstairs ceiling and flooded every room.
      </p>
      <p>
        We were on site that night, working from nine until the small hours on emergency
        clean-up.
      </p>
      <p>
        Flood water is Category 3 &mdash; grossly contaminated, what the trade calls black
        water. Anything porous it touched had to come out. We documented moisture
        readings, ran drying equipment and organized the hazardous materials assessment.
        Abatement was done by Assured Asbestos Abatement, and we rebuilt the suite.
      </p>
      <p>
        Often we&apos;re not called until after the initial water removal and clean-up,
        when what&apos;s needed is the rebuild. Either way, there are things worth knowing
        before you get to that point.
      </p>

      <h2>If you have a flood</h2>
      <p>
        <strong>Contact your insurance provider immediately.</strong> They&apos;ll send an
        adjuster to document the damage themselves.
      </p>
      <p>
        <strong>Document everything yourself as well.</strong> Photographs, and put
        everything in an email so there&apos;s a written record.
      </p>
      <p>
        <strong>Get it in writing.</strong> Don&apos;t accept a verbal acknowledgement of
        damage, and don&apos;t accept a &ldquo;sniff test&rdquo; as a determination of
        whether mold is present.
      </p>
      <p>
        <strong>You don&apos;t have to put it back exactly as it was.</strong> Insurance
        authorizes an amount to rebuild your suite to the standard it was before. If
        you&apos;d rather have finger-joint primed trim instead of MDF, hardwood instead
        of luxury vinyl plank, or a plywood kitchen instead of particle board, you can
        &mdash; you discuss the cost difference with your contractor, you pay that
        difference, and insurance pays the rest.
      </p>
      <p>
        <strong>You pay your deductible directly to the contractor.</strong> That&apos;s
        what locks them in to start the work. The amount is set by what you signed with
        your insurer, and it&apos;s usually stated at the beginning of your policy.
      </p>
      <p>
        <strong>At the end you&apos;ll sign a Certificate of Completion.</strong> That
        tells the insurer the work is done and releases the balance owed to your
        contractor.
      </p>

      <h2>If your insurer tries to shortcut the job</h2>
      <p>
        On one of these, the insurer wanted new flooring laid over the old substrate with
        no allowance for prep.
      </p>
      <p>
        Remind them, as we did, that flooring installed over a substrate that doesn&apos;t
        meet the manufacturer&apos;s specifications will not be warrantied. Then ask the
        question directly: if you insist this is installed incorrectly and the
        installation fails, are you paying for it to be redone? That tends to resolve the
        discussion.
      </p>
    </ServicePage>
  );
}
