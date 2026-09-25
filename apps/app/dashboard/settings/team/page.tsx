"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useClerk } from "@clerk/nextjs";

export default function TeamManagementPage() {
  const [members, setMembers] = useState([
    { id: "1", name: "Alice", email: "alice@acme.com", role: "admin" },
    { id: "2", name: "Bob", email: "bob@acme.com", role: "recruiter" },
  ]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Team Management</h1>
      <Card>
        <CardHeader><CardTitle>Org Members</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            {members.map(member => (
              <div key={member.id} className="flex justify-between items-center border-b pb-2">
                <div>
                  <p className="font-medium">{member.name}</p>
                  <p className="text-sm text-muted-foreground">{member.email}</p>
                </div>
                <div className="flex gap-2 items-center">
                  <Badge>{member.role}</Badge>
                  <Button variant="outline" size="sm">Edit</Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Button>Invite New Member</Button>
    </div>
  );
}