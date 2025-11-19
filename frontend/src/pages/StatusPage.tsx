import BuyPage from "./BuyPage";

export default function StatusPage() {
  return (
    <BuyPage
      statusEndpoint="http://localhost:8000/portfolio_status?direction=above"
      title="Portfolio Status"
    />
  );
}
