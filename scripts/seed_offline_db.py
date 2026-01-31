import sys
import os

# Add project root to path
sys.path.append(os.getcwd())

from api.services.offline_db import StatuteCache

def seed():
    cache = StatuteCache()
    
    sample_statutes = [
        {
            "jurisdiction": "California",
            "statute_id": "CCP § 430.10",
            "title": "Objection to Complaint",
            "content": "The party against whom a complaint or cross-complaint has been filed may object, by demurrer or answer as provided in Section 430.30, to the pleading on any one or more of the following grounds..."
        },
        {
            "jurisdiction": "California",
            "statute_id": "Civ. Code § 1714",
            "title": "Responsibility for willful acts and negligence",
            "content": "Everyone is responsible, not only for the result of his or her willful acts, but also for an injury occasioned to another by his or her want of ordinary care or skill in the management of his or her property or person..."
        },
        {
            "jurisdiction": "Florida",
            "statute_id": "Fla. Stat. § 95.11",
            "title": "Limitations other than for the recovery of real property",
            "content": "Actions other than for recovery of real property shall be commenced as follows: (3) WITHIN FOUR YEARS.— (a) An action founded on negligence."
        },
        {
            "jurisdiction": "New York",
            "statute_id": "CPLR § 3211",
            "title": "Motion to dismiss",
            "content": "A party may move for judgment dismissing one or more causes of action asserted against him on the ground that: 1. a defense is founded upon documentary evidence; or 2. the court has not jurisdiction of the subject matter of the cause of action..."
        }
    ]
    
    print("Seeding offline database...")
    for s in sample_statutes:
        cache.add_statute(s["jurisdiction"], s["statute_id"], s["title"], s["content"])
    print("Seeding complete.")

if __name__ == "__main__":
    seed()
