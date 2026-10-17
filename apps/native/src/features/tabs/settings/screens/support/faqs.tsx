import { Accordion, AccordionLayoutTransition } from "heroui-native/accordion";
import { ScrollView } from "react-native";

import { Screen } from "#/components/heroui/screen";
import { Text } from "#/components/heroui/text";

const questions = [
  {
    question: "What is NewsSpend, and how does it work?",
    answer:
      "NewsSpend is an interactive rewards platform where you can read news, watch videos, complete exciting tasks, and earn Dream Points. You can accumulate points toward your personal wishes through the Dream Fulfillment ecosystem or participate in giveaways for a chance to win amazing prizes.",
  },
  {
    question: "How do I earn Dream Points?",
    answer:
      "You earn Dream Points by reading news articles, watching videos, completing sponsored tasks, participating in surveys, and engaging in other eligible activities. The number of points awarded depends on the activity.",
  },
  {
    question: "What can I do with my Dream Points?",
    answer:
      "You can accumulate Dream Points toward a personal wish or goal within the Dream Fulfillment ecosystem or use eligible points to participate in giveaways. Your selected wish is fulfilled when you reach its displayed target points within your 12-month cycle.",
  },
  {
    question: "Do my Dream Points expire, and how often can I select a wish?",
    answer:
      "Your accumulated Dream Points toward a wish or goal are valid for 12 months from your registration date. You have the opportunity to select one wish during each 12-month cycle. Once you reach the displayed target points, you qualify to have your selected wish fulfilled. If you do not reach the target within the 12-month period, the accumulated points toward that wish expire, and a new cycle begins.",
  },
  {
    question: "What is the NewsSpend Giveaway, and how do I participate?",
    answer:
      "The NewsSpend Giveaway offers opportunities to win prizes across three categories. Each giveaway runs for 14 days from the date it opens. Visit the Giveaway section, select an available prize, and follow the instructions to obtain or use your giveaway tickets. Each eligible ticket represents an entry into the applicable draw.",
  },
  {
    question: "What prizes can I win on NewsSpend?",
    answer:
      "NewsSpend offers three exciting prize categories:\nTier 1 – High Tier Prizes: Refrigerators, deep freezers, generators, laptops, Smart TVs, PlayStation and Xbox consoles, hotel discounts, dinner experiences, ₦50,000 shopping vouchers, and VIP event tickets.\nTier 2 – Mid Tier Prizes: Smartphones, iPads, Apple Watches, smart home assistants, smart speakers, headphones, wireless earbuds, blenders, solar chargers, movie tickets, and bowling experiences.\nTier 3 – Everyday Rewards: Airtime, mobile data bundles, and gift cards.\nPrize availability, denominations, participating brands, and eligibility conditions may vary by giveaway.",
  },
  {
    question: "How can I increase my chances of winning a giveaway?",
    answer:
      "You can improve your chances by obtaining more eligible giveaway tickets, using the Boost Entries feature, and participating in qualifying featured offers. Generally, the more valid entries you hold, the greater your chances of being selected. However, winning is never guaranteed.",
  },
  {
    question: "How are giveaway winners selected, and when are draws held?",
    answer:
      "Each giveaway remains open for 14 days, after which the draw takes place. Winners are selected through the giveaway draw process using eligible entries, including applicable entry boosts. The scheduled draw date is displayed in the Giveaway section. Winners are announced or notified through NewsSpend's official communication channels.",
  },
  {
    question: "Do giveaway tickets or points used for entries get refunded?",
    answer:
      "Dream Points or tickets used for completed giveaway entries are generally non-refundable. Unsuccessful entries do not automatically qualify for a refund. Any exception will be communicated through the applicable giveaway rules.",
  },
  {
    question: "How long do I have to claim a giveaway prize?",
    answer:
      "Winners must claim their prizes within 14 days after the draw or before a new giveaway begins, whichever occurs first. Unclaimed prizes expire after the applicable deadline and may no longer be available for redemption. Always check your notifications and claim your rewards promptly.",
  },
  {
    question: "Who is eligible to win physical giveaway prizes?",
    answer:
      "Physical giveaway prizes are available only to participants who possess a valid Nigerian identification card. Winners may be required to complete identity and eligibility verification before receiving their prizes. Physical prizes are non-transferable and cannot be reassigned to another person.",
  },
  {
    question: "How long does it take to receive a prize?",
    answer:
      "Physical prizes are delivered within 7–10 days after successful claiming and completion of any required verification. Airtime and mobile data rewards are delivered immediately after a successful claim, subject to network availability and successful processing.",
  },
  {
    question: "Which mobile networks support airtime and data rewards?",
    answer:
      "Currently, NewsSpend supports airtime and data rewards for four Nigerian mobile networks:\nMTN\nAirtel\nGlo\n9mobile\nOther mobile networks are not currently supported, but we plan to expand the list in the future. Available airtime denominations and data bundle sizes depend on the specific giveaway prize.",
  },
  {
    question:
      "Can users outside Nigeria or on unsupported mobile networks claim airtime and data prizes?",
    answer:
      "Yes! If you live outside Nigeria or use an unsupported mobile network, you can provide a valid Nigerian mobile number on MTN, Airtel, Glo, or 9mobile to receive your airtime or data reward. Please verify the number carefully before claiming, as rewards are sent to the submitted number.",
  },
  {
    question: "What gift cards are available, and how do I redeem them?",
    answer:
      "NewsSpend offers gift cards from participating brands and retailers. Available brands, denominations, and redemption conditions are displayed in the applicable giveaway. Winners will receive instructions for redeeming their gift cards, subject to the issuing brand's terms and conditions.",
  },
  {
    question: "Is NewsSpend free to use?",
    answer:
      "Yes! NewsSpend is free to use. You can explore content and participate in eligible point-earning activities without a subscription. Certain optional premium features, promotions, or activities may have additional requirements.",
  },
  {
    question:
      "What should I do if my Dream Points or reward balance appears incorrect?",
    answer:
      "Review your recent qualifying activities, giveaway entries, and reward redemptions. If you believe there is an error, contact customer support with relevant screenshots and details so our team can investigate.",
  },
  {
    question: "How do I report a technical issue or bug?",
    answer:
      "Contact NewsSpend through the official support channel. Include your device type, app version (if known), a description of the issue, and screenshots where helpful. Never share your password, verification codes, or sensitive financial information.",
  },
  {
    question: "How does NewsSpend protect my personal information?",
    answer:
      "We value your privacy and the security of your information. Our Privacy Policy explains how personal data is collected, used, stored, and shared. We encourage users to review the policy, protect their login credentials, and report suspicious account activity.",
  },
  {
    question: "Can I advertise on NewsSpend, and how much does it cost?",
    answer:
      "Yes! NewsSpend offers advertising opportunities for businesses, brands, entrepreneurs, and individuals. Options may include banner ads, sponsored posts, promotional campaigns, and sponsored tasks. Pricing depends on the advertising format, placement, campaign duration, and promotional requirements. Contact our advertising team for available packages and pricing.",
  },
  {
    question: "Can businesses sponsor giveaways or become NewsSpend partners?",
    answer:
      "Absolutely! Businesses can explore opportunities to sponsor prizes, giveaways, reward campaigns, and other promotional activities. To become a partner, contact our business team with details about your organization and proposed collaboration. We'll review your proposal and discuss available partnership opportunities.",
  },
  {
    question: "How do I contact NewsSpend customer support?",
    answer:
      "You can reach our customer support team through the NewsSpend app or our official website. We're available to assist with account inquiries, Dream Points, giveaways, prize claims, advertising, partnerships, and technical issues.",
  },
];

const FAQs = () => (
  <Screen statusBarStyle="light">
    <ScrollView
      contentContainerClassName="p-4"
      layout={AccordionLayoutTransition}
      showsVerticalScrollIndicator={false}
    >
      <Accordion
        defaultValue={["0"]}
        selectionMode="multiple"
        variant="surface"
      >
        {questions.map((item, index) => (
          <Accordion.Item key={index} value={index.toString()}>
            <Accordion.Trigger>
              <Text className="flex-1 pr-2 font-semibold text-base">
                {index + 1}. {item.question}
              </Text>
              <Accordion.Indicator />
            </Accordion.Trigger>
            <Accordion.Content>
              <Text className="text-muted-foreground text-sm leading-relaxed">
                {item.answer}
              </Text>
            </Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion>
    </ScrollView>
  </Screen>
);

export default FAQs;
